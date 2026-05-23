// js/components/Icons.jsx
// A small wrapper since lucide icons via CDN are loaded globally as lucide.createIcons
const Icon = ({ name, className = "", size = 24 }) => {
    // We use a React ref to render the Lucide icon into a span
    const iconRef = React.useRef(null);

    React.useEffect(() => {
        if (iconRef.current && window.lucide) {
            // clear existing content
            iconRef.current.innerHTML = '';
            // Get the SVG string
            const iconSvg = window.lucide.icons[name];
            if (iconSvg) {
                // To render it we need to create the SVG element
                // Lucide provides createElement function but the CDN version is basic
                // A simpler way with the standalone script is using lucide.createIcons
                // However, since we are doing it dynamically per component:
                const tempDiv = document.createElement('div');
                const attrs = {
                    width: size,
                    height: size,
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': 2,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    class: className
                };
                
                // Construct the SVG markup manually from the icon's AST
                const createSvg = (iconName) => {
                    const iconNode = window.lucide.icons[iconName];
                    if (!iconNode) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`; // fallback to alert-circle
                    
                    const [tag, attr, children] = iconNode;
                    const childrenHtml = children ? children.map(child => {
                        const [childTag, childAttr] = child;
                        const attrString = Object.entries(childAttr).map(([k, v]) => `${k}="${v}"`).join(' ');
                        return `<${childTag} ${attrString}></${childTag}>`;
                    }).join('') : '';

                    const parentAttrString = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
                    return `<svg ${parentAttrString}>${childrenHtml}</svg>`;
                };
                
                iconRef.current.innerHTML = createSvg(name);
            }
        }
    }, [name, size, className]);

    return <span ref={iconRef} className="inline-flex items-center justify-center"></span>;
};

window.Icon = Icon;
