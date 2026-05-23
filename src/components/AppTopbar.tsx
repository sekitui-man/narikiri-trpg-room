import { LogOut, MessageSquareText, ShieldCheck, UserRound } from 'lucide-react';
import type { AccessRole, AuthState, ViewMode } from '../appTypes';

type AppTopbarProps = {
  authState: AuthState;
  currentAccessRole: AccessRole | null;
  currentView: ViewMode;
  onAdmin: () => void;
  onHome: () => void;
  onMyPage: () => void;
  onRooms: () => void;
  onSignOut: () => void;
};

export function AppTopbar({
  authState,
  currentAccessRole,
  currentView,
  onAdmin,
  onHome,
  onMyPage,
  onRooms,
  onSignOut,
}: AppTopbarProps) {
  return (
    <header className="topbar">
      <button className="brand brand-button" type="button" onClick={onHome} aria-label="トップへ戻る">
        <MessageSquareText size={23} />
        <span>Narikiri TRPG Room</span>
      </button>
      <div className="topbar-meta">
        <span className="access-chip">
          <ShieldCheck size={14} />
          {authState === 'demo' ? 'DEMO MODE' : 'INVITED ONLY'}
        </span>
        <div className="topbar-tabs" aria-label="表示切り替え">
          <button
            className={currentView === 'rooms' || currentView === 'room-scenes' ? 'topbar-tab active' : 'topbar-tab'}
            type="button"
            onClick={onRooms}
          >
            <MessageSquareText size={16} />
            ルーム
          </button>
          <button
            className={
              currentView === 'my-page' || currentView === 'characters' || currentView === 'character-new'
                ? 'topbar-tab active'
                : 'topbar-tab'
            }
            type="button"
            onClick={onMyPage}
          >
            <UserRound size={16} />
            マイページ
          </button>
          {currentAccessRole === 'owner' && (
            <button
              className={currentView === 'admin' ? 'topbar-tab active' : 'topbar-tab'}
              type="button"
              onClick={onAdmin}
            >
              <ShieldCheck size={16} />
              管理
            </button>
          )}
        </div>
        <button className="icon-button" type="button" aria-label="ログアウト" onClick={onSignOut}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
