"use client";

import Link from "next/link";
import { APP_CONTACT_EMAIL, APP_NAME } from "@/lib/branding";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16 text-left">
        <p className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)]">
          Terms & conditions
        </p>
        <h1 className="text-5xl font-light text-foreground">
          Terms and Conditions
        </h1>
        <p className="text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)]">
          Last updated: June 27, 2025
        </p>
        <div className="rounded-3xl border border-[color-mix(in_srgb,var(--foreground)_12%,transparent)] p-6 text-sm text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              1. Google services disclaimer
            </h2>
            <p>
              {APP_NAME} is not affiliated with, endorsed by, sponsored by, or
              connected to Google LLC in any way. Google Sheets™, Google
              Drive™, and related marks and logos are trademarks of Google LLC.
              Our application is independently created and maintained to work
              with Google&apos;s services.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              2. Application access
            </h2>
            <p>
              {APP_NAME} is free to use. You may access and use the web
              application for your personal or business productivity needs.
            </p>
            <ul className="space-y-2 list-disc list-inside">
              <li>Resell, distribute, or claim ownership of the app.</li>
              <li>Share malicious versions of the app or related assets.</li>
              <li>
                Reverse engineer or copy the app&apos;s functionality for resale.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              3. Data privacy
            </h2>
            <p>
              Your data remains yours. We do not sell your data or share it for
              advertising. You maintain full control and ownership of your data
              at all times.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              4. Pricing and tips
            </h2>
            <p>
              {APP_NAME} is offered free of charge. You may optionally provide a
              tip to support ongoing development. Tips are voluntary and are
              processed through secure third-party platforms; we do not store
              payment information.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              5. Refund policy
            </h2>
            <p>
              Because the application is free and tips are voluntary, refunds
              are generally not applicable. If you experience an issue with a
              tip transaction, contact us at {APP_CONTACT_EMAIL}.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              6. Account access
            </h2>
            <p>
              Access to the web application does not require payment. We
              reserve the right to suspend or terminate access for violation of
              these terms or suspected fraudulent activity.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              7. Service availability
            </h2>
            <p>
              While we strive for high uptime, we do not guarantee uninterrupted
              access to the application. Scheduled maintenance will be
              communicated in advance when possible. We are not liable for any
              losses due to service interruptions.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              8. Google account integration
            </h2>
            <p>
              Use of {APP_NAME} requires authorization through your Google
              account. You are responsible for maintaining the security of your
              Google account credentials. We access only the permissions you
              explicitly grant.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              9. Disclaimer of warranties
            </h2>
            <p>
              The application is provided &quot;as is&quot; without warranty of
              any kind. While we strive for excellence, we do not guarantee that
              {APP_NAME} will meet your specific requirements or be error-free.
              You assume all risks associated with using the app.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              10. Limitation of liability
            </h2>
            <p>
              {APP_NAME} shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages resulting from the
              use or inability to use the application.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              11. Updates to terms
            </h2>
            <p>
              We reserve the right to modify these terms at any time. Changes
              will be effective immediately upon posting. Your continued use of
              {APP_NAME} constitutes acceptance of any modifications.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[color-mix(in_srgb,var(--foreground)_55%,transparent)] mb-2">
              12. Contact
            </h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a
                href={`mailto:${APP_CONTACT_EMAIL}`}
                className="underline decoration-[color-mix(in_srgb,var(--foreground)_35%,transparent)] underline-offset-4 hover:text-foreground"
              >
                {APP_CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
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
