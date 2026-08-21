import { Outlet } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import AudioVisualizer from '../AudioVisualizer';
import PremiumThemeOverlay from '../PremiumThemeOverlay';
import AsteroidsGame from '../AsteroidsGame';
import UpdateBanner from '../UpdateBanner';
import LivelinessEffects from '../LivelinessEffects';
import { useAsteroidsGameStore } from '../../stores/asteroidsGameStore';
import { useThemeStore } from '../../stores/themeStore';

export default function AppLayout() {
  const gameOpen = useAsteroidsGameStore(s => s.isOpen);
  // Drifting particles and haze are pleasant on a monitor and tiring in a
  // headset, where they're pinned to your head and never settle. They're also
  // canvas work every frame, which a headset can't spare. The premium theme
  // itself is left alone — that's a choice, not decoration to override.
  const vrMode = useThemeStore(s => s.theme.vrMode);
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950 text-surface-200 relative">
      <PremiumThemeOverlay />
      <AudioVisualizer />
      {!vrMode && <LivelinessEffects />}
      <div className="flex flex-col flex-1 overflow-hidden relative z-[1]">
        <TitleBar />
        <UpdateBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-[1600px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {gameOpen && <AsteroidsGame />}
    </div>
  );
}
