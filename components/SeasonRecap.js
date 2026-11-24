import Link from "next/link"

export function formatSeasonDate(dateKey) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(dateKey))
}

const formatCount = new Intl.NumberFormat("en-US")
const formatAccuracy = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 })

export default function SeasonRecap({ season, closeout, compact = false }) {
  const { gamesMatchedToFinal, gamesPredicted, correctPredictions, accuracy } = closeout?.evaluation || {}
  const hasArchiveCounts = Number.isInteger(gamesPredicted) && gamesPredicted >= 0
    && Number.isInteger(gamesMatchedToFinal) && gamesMatchedToFinal >= 0 && gamesMatchedToFinal <= gamesPredicted
  const hasAccuracy = hasArchiveCounts && gamesMatchedToFinal > 0 && Number.isFinite(accuracy)
    && accuracy >= 0 && accuracy <= 1
  const standings = Object.entries(closeout?.ratings ?? {})
    .filter(([, rating]) => Number.isFinite(rating))
    .sort(([teamA, ratingA], [teamB, ratingB]) => ratingB - ratingA || teamA.localeCompare(teamB, "en-US"))
  const statsHref = `/stats?season=${season}`

  return (
    <section className="recap" id="season-recap" aria-labelledby="season-recap-title">
      <h2 id="season-recap-title">{season} season recap</h2>
      {!closeout ? <p>The season recap is pending.</p> : (
        <div className="recapGrid">
          <section className="recapCard" aria-labelledby="season-performance-title">
            <h3 id="season-performance-title">Prediction performance</h3>
            {hasAccuracy && <strong className="metric">{formatAccuracy.format(accuracy)} winner accuracy</strong>}
            {hasArchiveCounts ? (
              <p>{formatCount.format(gamesMatchedToFinal)} of {formatCount.format(gamesPredicted)} archived predictions matched to a final score.</p>
            ) : <p>Archived prediction results are unavailable.</p>}
            <p>{hasAccuracy
              ? "Accuracy measures how often the model picked the winner in games with a matched final score."
              : "Accuracy is available once archived predictions can be scored against final results."}</p>
            {!compact && hasAccuracy && Number.isInteger(correctPredictions) && correctPredictions >= 0
              && correctPredictions <= gamesMatchedToFinal && (
                <p>{formatCount.format(correctPredictions)} correct winner predictions out of {formatCount.format(gamesMatchedToFinal)} scored games.</p>
              )}
            {!compact && hasArchiveCounts && gamesPredicted > 0 && (
              <p>{formatAccuracy.format(gamesMatchedToFinal / gamesPredicted)} of archived predictions could be scored.</p>
            )}
            {compact && <Link href={`${statsHref}#season-recap`}>View season stats</Link>}
          </section>
          <section className="recapCard" id="final-team-elo" aria-labelledby="final-team-elo-title">
            <h3 id="final-team-elo-title">Final team Elo</h3>
            {standings.length ? (
              <>
                <p>{compact ? "Leading teams by the model’s end-of-season rating." : "Teams ranked by the model’s end-of-season rating."}</p>
                <ol>
                  {(compact ? standings.slice(0, 5) : standings).map(([team, rating]) => (
                    <li key={team}><span>{team}</span><strong>{formatCount.format(Math.round(rating))}</strong></li>
                  ))}
                </ol>
                {compact && <Link href={`${statsHref}#final-team-elo`}>View full Elo rankings</Link>}
              </>
            ) : <p>Final team ratings are unavailable.</p>}
          </section>
        </div>
      )}
      <style jsx>{`
        .recap { display: grid; gap: 14px; color: #e2e8f0; }
        h2, h3, p { margin: 0; }
        p { color: #cbd5e1; line-height: 1.5; }
        .recapGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 285px), 1fr)); gap: 14px; }
        .recapCard { display: grid; align-content: start; gap: 12px; padding: 18px; background: #17243a; border: 1px solid #334155; border-radius: 16px; }
        .metric { color: #bfdbfe; font-size: clamp(1.25rem, 3vw, 1.65rem); }
        ol { margin: 0; padding-inline-start: 1.5rem; }
        li { padding-block: 6px; }
        li + li { border-top: 1px solid #334155; }
        li strong { float: right; margin-inline-start: 12px; font-variant-numeric: tabular-nums; }
        .recapCard :global(a) { color: #bfdbfe; width: fit-content; text-underline-offset: 3px; }
      `}</style>
    </section>
  )
}
