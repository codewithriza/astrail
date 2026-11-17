import { cookies } from "next/headers";
import { LOCAL_AUTH_COOKIE, LOCAL_AUTH_VALUE } from "@/lib/local-auth-shared";

export {
  LOCAL_AUTH_COOKIE,
  LOCAL_AUTH_VALUE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";

export async function isLocalDemoSignedIn() {
  return (await cookies()).get(LOCAL_AUTH_COOKIE)?.value === LOCAL_AUTH_VALUE;
}
