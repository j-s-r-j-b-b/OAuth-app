import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import About from './pages/About.tsx';
import Generate from './pages/Generate.tsx';
import GuidePage from './pages/Guide.tsx';
import Home from './pages/Home.tsx';
import './styles.css';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Layout() {
  const nav = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2.5 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-stone-50/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-900 dark:text-white">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
              <rect width="32" height="32" rx="7" className="fill-slate-900 dark:fill-sky-400" />
              <path d="M7 22h18M9 22l4-9h6l4 9" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-sky-300 dark:stroke-slate-950" />
            </svg>
            OAuth Runway
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>
              Guides
            </NavLink>
            <NavLink to="/method" className={nav}>
              How it works
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/guides/:slug" element={<GuidePage />} />
          <Route path="/generate/:jobId" element={<Generate />} />
          <Route path="/method" element={<About />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-3xl px-4 py-20 text-center">
                <h1 className="text-2xl font-bold">Page not found</h1>
                <Link to="/" className="btn mt-6">
                  Back to guides
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="no-print border-t border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
        Toolkit data from{' '}
        <a className="underline" href="https://docs.composio.dev/toolkits/managed-auth" target="_blank" rel="noreferrer">
          Composio's managed OAuth directory
        </a>
        . Every claim in a guide links to its source or to a probe we ran. Guides can be wrong, so check the evidence before you commit.
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Layout />
    </BrowserRouter>
  </StrictMode>,
);
