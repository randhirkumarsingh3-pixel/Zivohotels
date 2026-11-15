/**
 * The ZivoHotels logo: the Z mark, optionally with the wordmark and a product label
 * ("Extranet", "Admin"). On dark backgrounds (`onDark`) the mark sits on a white tile, because its
 * white Z is open to the outside and would take the background colour.
 */
const SIZES = {
  sm: { mark: 'h-7 w-7', tile: 'p-1 rounded-lg', text: 'text-lg', label: 'text-xs' },
  md: { mark: 'h-9 w-9', tile: 'p-1 rounded-lg', text: 'text-2xl', label: 'text-xs' },
  lg: { mark: 'h-14 w-14', tile: 'p-1.5 rounded-xl', text: 'text-3xl', label: 'text-sm' },
};

export const LogoMark = ({ size = 'md', onDark = false, className = '' }) => {
  const s = SIZES[size] || SIZES.md;
  const img = <img src="/brand/zivo-mark.png" alt="" aria-hidden="true" className={`${s.mark} object-contain shrink-0`} draggable="false" />;
  return onDark ? <span className={`bg-white inline-flex shrink-0 ${s.tile} ${className}`}>{img}</span> : <span className={`inline-flex shrink-0 ${className}`}>{img}</span>;
};

const Logo = ({ size = 'md', onDark = false, label, showText = true, className = '' }) => {
  const s = SIZES[size] || SIZES.md;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label={label ? `ZivoHotels ${label}` : 'ZivoHotels'} role="img">
      <LogoMark size={size} onDark={onDark} />
      {showText && (
        <span className="flex flex-col leading-none">
          <span className={`font-display font-extrabold tracking-tight ${s.text} ${onDark ? 'text-white' : 'text-navy-800'}`}>
            Zivo<span className={onDark ? 'text-brand-400' : 'text-brand-600'}>Hotels</span>
          </span>
          {label && <span className={`${s.label} font-semibold uppercase tracking-[0.14em] mt-1 ${onDark ? 'text-navy-200' : 'text-gray-500'}`}>{label}</span>}
        </span>
      )}
    </span>
  );
};

export default Logo;
