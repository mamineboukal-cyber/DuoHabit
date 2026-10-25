/** Placeholder for a tab destination whose real screen arrives in a later step. */
export default function ComingSoon({ title, step }: { title: string; step: number }) {
  return (
    <section className="mx-auto max-w-xl rounded-card border border-line bg-surface p-6 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Step {step}</p>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-content-muted">
        This screen arrives in Step {step}. The navigation is already in place.
      </p>
    </section>
  );
}
