export function AboutIntro() {
  return (
    <section className="py-section">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="max-w-prose">
          <h1 className="text-display font-bold text-ink">About this project</h1>
          <p className="mt-6 text-body">
            Someone who wants to learn how Indian equity trading actually works has two poor
            options: open a real demat account and find out which button does what while real
            capital is at risk, or read about it and never touch an order form. Neither teaches the
            mechanics — margin being blocked when you place an order, a rejection you did not
            expect, brokerage and STT quietly eating a winning trade, an intraday position closed
            out from under you at 3:20pm.
          </p>
          <p className="mt-4 text-body">
            ZerodhaRebuild reproduces those mechanics against simulated prices with nothing at
            stake. It is also a portfolio piece, and the interesting engineering is not the screens:
            it is transactional correctness in the order engine, per-user isolation enforced in the
            database rather than in application code, and a price pipeline that refuses to claim a
            figure is fresher or more real than it is — built entirely on infrastructure that costs
            nothing to run.
          </p>
        </div>
      </div>
    </section>
  )
}
