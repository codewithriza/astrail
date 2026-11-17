do $$
declare constraint_name text;
begin
  select tc.constraint_name into constraint_name
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
  where tc.table_schema='public' and tc.table_name='profiles' and tc.constraint_type='FOREIGN KEY'
    and ccu.table_schema='auth' and ccu.table_name='users'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
end $$;

create or replace function public.link_neon_identity(p_new_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id uuid;
  column_names text;
  select_values text;
  item record;
  remaining bigint;
begin
  if p_new_id is null or nullif(trim(p_email), '') is null then
    raise exception 'A valid Neon identity and email are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 0));

  select id into old_id
  from public.profiles
  where lower(email) = lower(trim(p_email)) and id <> p_new_id
  order by created_at nulls last, id
  limit 1;

  if old_id is null then
    insert into public.profiles(id, email)
    values (p_new_id, lower(trim(p_email)))
    on conflict (id) do update set email = excluded.email;
    return false;
  end if;

  select
    string_agg(format('%I', column_name), ', ' order by ordinal_position),
    string_agg(
      case column_name
        when 'id' then '$1::uuid'
        when 'email' then '$2::text'
        else format('%I', column_name)
      end,
      ', ' order by ordinal_position
    )
  into column_names, select_values
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles';

  execute format(
    'insert into public.profiles(%s) select %s from public.profiles where id=$3 on conflict(id) do update set email=excluded.email',
    column_names,
    select_values
  ) using p_new_id, lower(trim(p_email)), old_id;

  for item in
    select distinct tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY'
      and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
  loop
    execute format('update %I.%I set %I=$1 where %I=$2', item.table_schema, item.table_name, item.column_name, item.column_name)
      using p_new_id, old_id;
  end loop;

  for item in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY'
      and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
  loop
    execute format('select count(*) from %I.%I where %I=$1', item.table_schema, item.table_name, item.column_name)
      into remaining using old_id;
    if remaining > 0 then
      raise exception 'Identity relink left % rows in %.%', remaining, item.table_schema, item.table_name;
    end if;
  end loop;

  delete from public.profiles where id=old_id;
  delete from auth.users where id=old_id;
  return true;
end;
$$;

revoke all on function public.link_neon_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.link_neon_identity(uuid, text) to admin;
