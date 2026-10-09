"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import Mascot from "./Mascot";
import { PixelArrow, PixelSprite, useReducedMotion } from "./pixel-ui";
import { CHECK } from "./sprites";
import { contact } from "./content";

const f = contact.form;
const MAX_MESSAGE = 1600;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const empty = { name: "", email: "", company: "", role: "developer", interests: [], message: "", website: "" };

function validate(v) {
  const errors = {};
  if (v.name.trim().length < 2) errors.name = f.errors.name;
  if (!EMAIL_RE.test(v.email.trim())) errors.email = f.errors.email;
  if (v.message.trim().length < 10) errors.message = f.errors.message;
  return errors;
}

/**
 * Sends to the existing /api/design-partners intake endpoint.
 * No backend changes: the message is mapped onto that endpoint's fields.
 */
function toPayload(v) {
  const interests = v.interests.join(", ");
  const message = v.message.trim();
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    company: v.company.trim() || "Not given",
    role: "Website contact form",
    persona: v.role,
    agent_kind: message.slice(0, 1200),
    workflow_goal: message,
    needed_api: interests || "General question",
    systems_involved: interests || "Not specified",
    has_api_docs: "yes",
    api_docs_url_or_notes: "Sent from the astrail.dev contact form.",
    approval_steps: "Not specified",
    auth_constraints: "Not specified",
    runtime_preference: "self_hosted",
    urgency: "exploring",
  };
}

export default function ContactForm() {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [shake, setShake] = useState(0);
  const formRef = useRef(null);
  const successRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (done) successRef.current?.focus();
  }, [done]);

  useEffect(() => {
    const el = formRef.current;
    if (!shake || !el) return;
    el.classList.remove(s.shake);
    void el.offsetWidth;
    el.classList.add(s.shake);
  }, [shake]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const toggleInterest = (item) =>
    setValues((v) => ({
      ...v,
      interests: v.interests.includes(item) ? v.interests.filter((i) => i !== item) : [...v.interests, item],
    }));

  async function onSubmit(e) {
    e.preventDefault();
    setServerError("");
    const found = validate(values);
    setErrors(found);
    const firstInvalid = ["name", "email", "message"].find((k) => found[k]);
    if (firstInvalid) {
      if (!reduced) setShake((n) => n + 1);
      formRef.current?.querySelector(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    // honeypot: quietly pretend it worked
    if (values.website) {
      setDone(true);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/design-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(values)),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        setServerError(typeof data.error === "string" && data.error ? data.error : f.errors.fallback);
        return;
      }
      setDone(true);
      setValues(empty);
    } catch {
      setServerError(f.errors.network);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div ref={successRef} tabIndex={-1} role="status" className={s.success}>
        <Mascot bubble={false} ollieOnce className={s.successBot} />
        <h3 className={s.successTitle}>{f.success.title}</h3>
        <p className={s.successText}>{f.success.text}</p>
        <button type="button" className={`${s.btn} ${s.btnMd}`} onClick={() => setDone(false)}>
          {f.success.again}
          <PixelArrow />
        </button>
      </div>
    );
  }

  const fieldProps = (key) => ({
    id: `contact-${key}`,
    name: key,
    value: values[key],
    onChange: set(key),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `contact-${key}-error` : undefined,
    className: `${s.input} ${errors[key] ? s.inputError : ""}`,
  });

  const errorText = (key) =>
    errors[key] ? (
      <p id={`contact-${key}-error`} className={s.fieldError}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      className={s.form}
      aria-label="Contact the Astrail team"
    >
      <div className={s.formRow2}>
        <div className={s.field}>
          <label htmlFor="contact-name" className={s.label}>
            your name
          </label>
          <input {...fieldProps("name")} type="text" autoComplete="name" maxLength={100} placeholder="Alex Rivera" />
          {errorText("name")}
        </div>
        <div className={s.field}>
          <label htmlFor="contact-email" className={s.label}>
            email
          </label>
          <input {...fieldProps("email")} type="email" autoComplete="email" maxLength={254} placeholder="alex@company.com" />
          {errorText("email")}
        </div>
      </div>

      <div className={s.field}>
        <label htmlFor="contact-company" className={s.label}>
          company <span className={s.optional}>(optional)</span>
        </label>
        <input {...fieldProps("company")} type="text" autoComplete="organization" maxLength={120} placeholder="Your team or project" />
      </div>

      <fieldset className={s.fieldset}>
        <legend className={s.label}>i am a</legend>
        <div className={s.chips}>
          {f.roles.map((r) => (
            <label key={r.value} className={s.chip}>
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={values.role === r.value}
                onChange={set("role")}
                className={s.chipInput}
              />
              <span className={s.chipFace}>
                <PixelSprite rows={CHECK} className={s.chipCheck} />
                {r.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend className={s.label}>
          interested in <span className={s.optional}>(optional)</span>
        </legend>
        <div className={s.chips}>
          {f.interests.map((item) => (
            <label key={item} className={s.chip}>
              <input
                type="checkbox"
                name="interests"
                value={item}
                checked={values.interests.includes(item)}
                onChange={() => toggleInterest(item)}
                className={s.chipInput}
              />
              <span className={s.chipFace}>
                <PixelSprite rows={CHECK} className={s.chipCheck} />
                {item}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={s.field}>
        <label htmlFor="contact-message" className={s.label}>
          what are you building?
        </label>
        <textarea
          {...fieldProps("message")}
          rows={5}
          maxLength={MAX_MESSAGE}
          placeholder="Which API do you want to turn into agent tools, and what would success look like?"
          className={`${s.input} ${s.textarea} ${errors.message ? s.inputError : ""}`}
        />
        <div className={s.fieldFoot}>
          {errorText("message") ?? <span />}
          <span className={s.counter} aria-hidden="true">
            {values.message.length}/{MAX_MESSAGE}
          </span>
        </div>
      </div>

      <div className={s.honeypot} aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>

      {serverError && (
        <div role="alert" className={s.serverError}>
          {serverError}
        </div>
      )}

      <div className={s.formFoot}>
        <p className={s.formNote}>{f.note}</p>
        <button type="submit" disabled={sending} className={`${s.btn} ${s.btnLg} ${s.submit}`}>
          {sending ? (
            <>
              sending
              <span className={s.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className={s.srOnly} role="status">
                Sending your message
              </span>
            </>
          ) : (
            <>
              send it!
              <PixelArrow />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
