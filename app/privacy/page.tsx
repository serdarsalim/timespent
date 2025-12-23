"use client";

import Link from "next/link";
import { APP_CONTACT_EMAIL, APP_NAME } from "@/lib/branding";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16 text-left">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          Privacy & data
        </p>
        <h1 className="text-5xl font-light text-foreground">Privacy Policy</h1>
        <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          This policy explains how {APP_NAME} handles your data. The short
          version: your work stays private, and we collect only what we need to
          run the app.
        </p>
        <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              1. Overview
            </h2>
            <p>
              {APP_NAME} is committed to protecting your privacy. This policy
              explains how we handle your data when you use the app.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              2. Information we collect
            </h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>
                <strong>Account information:</strong> If you sign in with
                Google, we receive your basic profile information (name, email
                address, avatar) and a Google identifier.
              </li>
              <li>
                <strong>App data:</strong> Your objectives, key results, weekly
                plans, daily scores, and notes you enter in {APP_NAME}.
              </li>
              <li>
                <strong>Usage analytics:</strong> Basic usage statistics and
                error logs to improve reliability.
              </li>
              <li>
                <strong>Support communications:</strong> Information you provide
                when contacting support.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              3. How your data is handled
            </h2>
            <p>
              Your productivity data is stored and displayed inside {APP_NAME}.
              We do not sell or share it for advertising. You can export or
              delete your data at any time by contacting us.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              4. Google account permissions
            </h2>
            <p>
              When you authorize {APP_NAME} with Google, you grant us permission
              to authenticate you and access your basic profile information for
              login. You can revoke access at any time in your Google Account
              settings.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              5. How we use collected information
            </h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>Authenticate your access to the application.</li>
              <li>Provide, maintain, and improve the app.</li>
              <li>Provide customer support when requested.</li>
              <li>Communicate service updates with your consent.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              6. Data sharing & third parties
            </h2>
            <p>
              We do not sell, rent, or share your personal information. We work
              with service providers needed to operate {APP_NAME} (such as
              hosting and analytics), and they only receive the minimum data
              required to deliver the service.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              7. Data security
            </h2>
            <p>
              We use standard security measures to protect your information,
              including encrypted connections and access controls for systems
              that store app data.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              8. Your rights and choices
            </h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>Access: Request information about the data we have.</li>
              <li>Deletion: Request deletion of your account and data.</li>
              <li>
                Revoke access: Remove permissions in your Google Account
                settings.
              </li>
              <li>Opt-out: Unsubscribe from non-essential emails.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              9. Cookies & tracking
            </h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>Essential cookies for authentication and session management.</li>
              <li>Analytics cookies to understand usage patterns.</li>
              <li>No advertising or third-party tracking cookies.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              10. Children&apos;s privacy
            </h2>
            <p>
              {APP_NAME} is not intended for children under 13. We do not
              knowingly collect information from children. If you believe a
              child has provided us with information, contact us immediately.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              11. Changes to this policy
            </h2>
            <p>
              We may update this Privacy Policy periodically. We will notify
              you of significant changes via email or through the app. Continued
              use after changes constitutes acceptance of the updated policy.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              12. Google API data use
            </h2>
            <p>
              {APP_NAME}&apos;s use and transfer of information received from
              Google APIs adheres to the Google API Services User Data Policy,
              including the Limited Use requirements. We do not use Google data
              for advertising or sell it to third parties.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              13. Contact
            </h2>
            <p>
              Questions or requests? Email{" "}
              <a
                href={`mailto:${APP_CONTACT_EMAIL}`}
                className="underline decoration-[color-mix(in_srgb,var(--foreground)_35%,transparent)] underline-offset-4 hover:text-foreground"
              >
                {APP_CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
          <p className="text-xs text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
            Last updated: Tue, Dec 23 2025
          </p>
        </div>
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_60%,transparent)] transition hover:text-foreground"
        >
          ← Back to app
        </Link>
      </main>
    </div>
  );
}
