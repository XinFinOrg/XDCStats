import React, { useState, useRef, useEffect } from 'react';
import { getNetworkLinks, type NavLink } from '../config/networkLinks';

const { navLinks: NAV_LINKS, moreLinks: MORE_LINKS, switchLink: SWITCH_LINK } = getNetworkLinks(import.meta.env.MODE);

const linkStyle = (active?: boolean): React.CSSProperties => ({
  color: active ? '#44a2d2' : '#7a8598',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

export const TopNavLinks: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as globalThis.Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <ul
      className="hidden md:flex items-center gap-4"
      style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: '1px solid #dde3eb', paddingLeft: 16 }}
    >
      {NAV_LINKS.map((link: NavLink) => (
        <li key={link.label}>
          <a
            href={link.href}
            target={link.href.startsWith('http') ? '_blank' : undefined}
            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="text-xs uppercase tracking-wide hover:opacity-70"
            style={linkStyle(link.active)}
          >
            {link.label}
          </a>
        </li>
      ))}
      <li ref={moreRef} className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="text-xs uppercase tracking-wide hover:opacity-70"
          style={{ ...linkStyle(false), background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          More &#9662;
        </button>
        {moreOpen && (
          <ul
            className="absolute left-0 mt-2 py-1"
            style={{
              listStyle: 'none',
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              border: '1px solid #e4eaf0',
              minWidth: 180,
              zIndex: 60,
            }}
          >
            {MORE_LINKS.map((link: NavLink) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-xs hover:bg-gray-100"
                  style={{ color: '#2d3b48', whiteSpace: 'nowrap' }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>
    </ul>
  );
};

export const SwitchNetworkLink: React.FC = () => (
  <a
    href={SWITCH_LINK.href}
    target="_blank"
    rel="noopener noreferrer"
    className="hidden lg:inline text-xs font-bold uppercase tracking-wide hover:opacity-70"
    style={{ color: '#44a2d2', whiteSpace: 'nowrap' }}
  >
    {SWITCH_LINK.label}
  </a>
);
