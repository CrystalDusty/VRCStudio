import { useThemeStore, visiblePremiumTheme } from '../stores/themeStore';
import AsteroidsBackground from './AsteroidsBackground';
import KoiPondBackground from './KoiPondBackground';

export default function PremiumThemeOverlay() {
  const selected = useThemeStore(s => s.theme.premiumTheme);
  const vrMode = useThemeStore(s => s.theme.vrMode);
  // Shared with applyTheme, so the class on <html> and the element drawn here
  // can never disagree about which theme is showing.
  const premiumTheme = visiblePremiumTheme(selected, vrMode);
  if (premiumTheme === 'none') return null;
  if (premiumTheme === 'asteroids') return <AsteroidsBackground />;
  if (premiumTheme === 'koi') return <KoiPondBackground />;
  return (
    <div
      className={`premium-overlay premium-overlay-${premiumTheme}`}
      aria-hidden="true"
    />
  );
}
