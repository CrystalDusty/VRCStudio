import { useThemeStore } from '../stores/themeStore';
import AsteroidsBackground from './AsteroidsBackground';
import KoiPondBackground from './KoiPondBackground';

export default function PremiumThemeOverlay() {
  const premiumTheme = useThemeStore(s => s.theme.premiumTheme);
  if (!premiumTheme || premiumTheme === 'none') return null;
  if (premiumTheme === 'asteroids') return <AsteroidsBackground />;
  if (premiumTheme === 'koi') return <KoiPondBackground />;
  return (
    <div
      className={`premium-overlay premium-overlay-${premiumTheme}`}
      aria-hidden="true"
    />
  );
}
