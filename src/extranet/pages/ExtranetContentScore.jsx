import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, Loader2, Lightbulb } from 'lucide-react';
import { fetchPropertyOverview } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import PropertyHeader, { ScoreRing } from '../components/PropertyHeader';
import { scoreTone, editLink } from '../components/propertySections';

/**
 * Content score: how complete the listing is, section by section, with the fixes worth the most
 * points first. Every fix opens the right part of the listing editor.
 */
const ExtranetContentScore = () => {
  const { hotelId, addToast } = useExtranet();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchPropertyOverview()
      .then((d) => { if (live) setOverview(d); })
      .catch((e) => addToast?.(e.message, 'error'))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [hotelId, addToast]);

  if (loading && !overview) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={32} /></div>;
  if (!overview) return null;
  const { hotel, content } = overview;
  const tone = scoreTone(content.score);
  const top = content.nextSteps.slice(0, 3);

  return (
    <div className="space-y-6 pb-12">
      <PropertyHeader overview={overview} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white rounded-card border border-gray-200 shadow-sm p-5 sm:p-6 flex flex-col items-center text-center">
          <h1 className="text-lg font-bold text-gray-900 self-start">Content score</h1>
          <div className="my-5"><ScoreRing score={content.score} size={132} stroke={12} /></div>
          <p className={`text-base font-semibold ${tone.text}`}>{content.label}</p>
          <p className="mt-2 text-sm text-gray-600">Complete listings show higher in search and turn more visits into bookings. The score updates as soon as you save changes.</p>
        </section>

        <section className="lg:col-span-2 bg-white rounded-card border border-gray-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Lightbulb size={18} className="text-amber-500" aria-hidden="true" /> Do these next</h2>
          {top.length ? (
            <ol className="mt-4 space-y-3">
              {top.map((t, i) => (
                <li key={`${t.section}-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-navy-800 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-800">{t.tip}</span>
                  <span className="text-xs font-semibold text-green-800 whitespace-nowrap">+{Math.round(t.gain)} pts</span>
                  <Link to={editLink(hotel.id, t.section)} className="text-sm font-semibold text-navy-700 hover:underline whitespace-nowrap flex items-center gap-1">Fix <ArrowRight size={14} aria-hidden="true" /></Link>
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-green-800">Everything is complete. Keep photos and prices up to date.</p>}
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {content.sections.map((sec) => {
          const pct = Math.round((sec.score / sec.max) * 100);
          return (
            <section key={sec.key} className="bg-white rounded-card border border-gray-200 shadow-sm p-5" aria-labelledby={`sec-${sec.key}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 id={`sec-${sec.key}`} className="font-bold text-gray-900">{sec.label}</h3>
                <span className="text-sm font-semibold text-gray-700">{sec.score}/{sec.max}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreTone(pct).ring }} />
              </div>
              <ul className="mt-4 space-y-2.5">
                {sec.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2.5 text-sm">
                    {c.done
                      ? <CheckCircle2 size={18} className="text-green-700 shrink-0 mt-px" aria-label="Done" />
                      : <Circle size={18} className="text-gray-300 shrink-0 mt-px" aria-label="To do" />}
                    <span className="flex-1">
                      <span className={c.done ? 'text-gray-700' : 'text-gray-900 font-medium'}>{c.label}</span>
                      {!c.done && <span className="block text-xs text-gray-600 mt-0.5">{c.tip}</span>}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{Math.round(c.earned)}/{c.points}</span>
                  </li>
                ))}
              </ul>
              {sec.score < sec.max && (
                <Link to={editLink(hotel.id, sec.key)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
                  Edit {sec.label.toLowerCase()} <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ExtranetContentScore;
