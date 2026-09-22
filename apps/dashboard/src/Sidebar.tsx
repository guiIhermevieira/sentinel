import { PAGE_GROUPS, PAGES } from './content/pages';
import { RemoveIcon, ShieldIcon } from './icons';

interface Props {
  current: string;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ current, open, onClose }: Props) {
  return (
    <nav className="sidebar" aria-label="Documentation" data-open={open} id="sidebar">
      <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close menu">
        <RemoveIcon />
      </button>
      <a className="brand" href="#/overview" onClick={onClose}>
        <ShieldIcon className="brand-mark" />
        <span className="brand-name">
          Sentinel
          <span className="brand-sub">Developer console</span>
        </span>
      </a>
      {PAGE_GROUPS.map((group) => (
        <div className="nav-group" key={group}>
          <h2>{group}</h2>
          <ul>
            {PAGES.filter((p) => p.group === group).map((p) => (
              <li key={p.id}>
                <a className="nav-link" href={`#/${p.id}`} aria-current={p.id === current ? 'page' : undefined} onClick={onClose}>
                  {p.title === 'Sentinel' ? 'Overview' : p.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="sidebar-footer">
        <a href="https://github.com/guiIhermevieira/sentinel">Source code on GitHub</a>
        <a href="https://www.npmjs.com/org/sentinel-aml">Packages on npm</a>
      </div>
    </nav>
  );
}
