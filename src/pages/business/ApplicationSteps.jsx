/** The five steps of a ZivoPlus for Business / Partner Hub application (step 1 is the account). */
const STEP_LABELS = ['Your account', 'Business details', 'Documents', 'Bank account', 'Review and submit'];

const Steps = ({ current, onGo }) => (
  <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Application steps">
    {STEP_LABELS.map((label, i) => {
      const n = i + 1; const done = n < current; const on = n === current;
      const canGo = onGo && n > 1 && n < current;
      const inner = (
        <>
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-green-600 text-white' : on ? 'bg-navy-800 text-white' : 'bg-gray-200 text-gray-600'}`}>{done ? '✓' : n}</span>
          <span className={on ? 'font-semibold text-gray-900' : 'text-gray-500'}>{label}</span>
        </>
      );
      return (
        <li key={label} className="flex items-center gap-2" aria-current={on ? 'step' : undefined}>
          {i > 0 && <span className="w-5 h-px bg-gray-300" aria-hidden="true" />}
          {canGo ? <button type="button" onClick={() => onGo(n)} className="flex items-center gap-2 hover:underline">{inner}</button> : inner}
        </li>
      );
    })}
  </ol>
);

export default Steps;
