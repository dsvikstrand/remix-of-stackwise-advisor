import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

const EFFECTIVE_DATE = '2026-03-05';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-10 pb-24 space-y-6">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

        <section className="space-y-3 text-sm leading-6">
          <p>
            We collect account, session, and product usage data required to operate Bleup. This includes authentication
            details, generation activity, and service logs needed for reliability and abuse prevention.
          </p>
          <p>
            We use this data to provide core features, secure the platform, and improve performance. We do not sell your
            personal data.
          </p>
          <p>
            Some features rely on third-party providers (for example YouTube and LLM services). Data shared with those
            providers is limited to what is needed to complete your request.
          </p>
          <p>
            Privacy requests can be sent to
            {' '}
            <a className="underline" href="mailto:privacy@vdsai.cloud">privacy@vdsai.cloud</a>.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
