import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

const EFFECTIVE_DATE = '2026-03-05';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-10 pb-24 space-y-8">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

        <section className="space-y-3 text-sm leading-6">
          <p>
            Bleu collects account, session, and product usage data needed to operate the service. This includes
            authentication details, blueprint-generation activity, feed/subscription state, and service logs needed for
            reliability, abuse prevention, and debugging.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Information we collect</h2>
          <p>
            Depending on how you use Bleu, we may collect account identifiers, profile metadata, saved subscriptions,
            joined channels, connected-provider status, generation history, and product interaction events. We also
            collect operational logs that help us detect failures, prevent abuse, and improve reliability.
          </p>
          <p>
            We use this information to provide the core product, personalize your feed, secure the platform, and measure
            performance. We do not sell your personal data.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Google and YouTube account connection</h2>
          <p>
            Bleu may let you connect a Google account in order to access YouTube account data needed for the
            subscription-import feature. When you connect YouTube, Bleu uses that access to read the creators you follow
            so it can import those subscriptions into your Bleu account and help personalize your feed setup.
          </p>
          <p>
            Bleu does not use this connection to post to YouTube, upload videos, edit your YouTube account, or act on
            your behalf outside the import and personalization flow described above.
          </p>
          <p>
            If you disconnect YouTube inside Bleu, the OAuth connection is removed. Previously imported Bleu-side
            subscription rows may remain in your Bleu account until you delete or unsubscribe them, because they are part
            of your in-app feed setup rather than a live mirror of your Google account.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Third-party providers</h2>
          <p>
            Some features rely on third-party providers such as YouTube, Google, transcript services, and language model
            services. Data sent to those providers is limited to what is reasonably necessary to complete the feature you
            triggered, such as importing subscriptions, retrieving a transcript, or generating a blueprint.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Retention, deletion, and your choices</h2>
          <p>
            Bleu retains account and product data for as long as needed to operate the service, maintain reliability,
            investigate abuse, and preserve user-created content and feed setup. Operational logs may be retained
            separately for security and debugging.
          </p>
          <p>
            You can disconnect a connected YouTube account from within the app. You can also request account or data
            deletion by contacting us. We will review those requests and respond in line with applicable law and the
            operational needs of the service.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p>
            Privacy requests can be sent to{' '}
            <a className="underline" href="mailto:privacy@vdsai.cloud">privacy@vdsai.cloud</a>.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
