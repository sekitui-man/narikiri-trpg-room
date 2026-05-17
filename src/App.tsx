import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  DoorOpen,
  Lock,
  LogOut,
  Mail,
  MessageSquareText,
  PanelRight,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import { demoCharacters, demoMessages, demoScenes } from './demoData';
import type { Character, RpMessage, Scene } from './types';

type AuthState = 'checking' | 'signed-out' | 'allowed' | 'blocked' | 'demo';
type AccessRole = 'owner' | 'gm' | 'player' | 'viewer';
type AllowedMember = {
  email: string;
  display_name: string;
  role: AccessRole;
};

const authRedirectUrl = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim();
const magicLinkCooldownSeconds = 60;

export function App() {
  const [authState, setAuthState] = useState<AuthState>(isSupabaseConfigured ? 'checking' : 'demo');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isMagicLinkSending, setIsMagicLinkSending] = useState(false);
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0);
  const [characters, setCharacters] = useState<Character[]>(demoCharacters);
  const [scenes, setScenes] = useState<Scene[]>(demoScenes);
  const [messages, setMessages] = useState<RpMessage[]>(demoMessages);
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0].id);
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0].id);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [mode, setMode] = useState<'ic' | 'ooc'>('ic');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user?.email) {
        setAuthState('signed-out');
        return;
      }
      setCurrentUserId(data.user.id);
      const allowedMember = await checkAllowed(data.user.email);
      if (allowedMember) await ensureMemberBootstrap(data.user.id, data.user.email, allowedMember);
      if (allowedMember) await loadRoomData(data.user.id, data.user.email);
      setAuthState(allowedMember ? 'allowed' : 'blocked');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.email) {
        setAuthState('signed-out');
        setCurrentUserId(null);
        return;
      }
      setCurrentUserId(session.user.id);
      checkAllowed(session.user.email).then(async (allowedMember) => {
        if (allowedMember) await ensureMemberBootstrap(session.user.id, session.user.email!, allowedMember);
        if (allowedMember) await loadRoomData(session.user.id, session.user.email!);
        setAuthState(allowedMember ? 'allowed' : 'blocked');
      });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (magicLinkCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setMagicLinkCooldown((remaining) => Math.max(remaining - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [magicLinkCooldown]);

  const activeCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0];
  const activeScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];

  const groupedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        character: characters.find((character) => character.id === message.characterId),
      })),
    [characters, messages],
  );

  async function checkAllowed(userEmail: string) {
    if (!supabase) return false;
    const { data, error } = await supabase
      .from('allowed_members')
      .select('email, display_name, role')
      .eq('email', userEmail.toLowerCase())
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      setAuthMessage(error.message);
      return false;
    }
    return data as AllowedMember | null;
  }

  async function ensureMemberBootstrap(userId: string, userEmail: string, allowedMember: AllowedMember) {
    if (!supabase) return;

    await supabase.from('profiles').upsert({
      id: userId,
      email: userEmail.toLowerCase(),
      display_name: allowedMember.display_name,
      updated_at: new Date().toISOString(),
    });

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1);

    if (roomsError || rooms?.length) {
      if (roomsError) setAuthMessage(roomsError.message);
      return;
    }

    if (!['owner', 'gm'].includes(allowedMember.role)) return;

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        title: '夜明け前の酒場',
        summary: '雨音が屋根を打つ。閉店後の酒場に、まだ灯りがひとつ残っている。',
        created_by: userId,
      })
      .select('id')
      .single();

    if (roomError || !room) {
      setAuthMessage(roomError?.message ?? '初期ルームを作成できませんでした。');
      return;
    }

    const bootstrapRole = allowedMember.role === 'gm' ? 'gm' : 'owner';
    const { error: memberError } = await supabase.from('room_members').insert({
      room_id: room.id,
      user_id: userId,
      role: bootstrapRole,
    });

    if (memberError) {
      setAuthMessage(memberError.message);
      return;
    }

    await Promise.all([
      supabase.from('scenes').insert({
        room_id: room.id,
        title: '夜明け前の酒場',
        summary: '雨音が屋根を打つ。閉店後の酒場に、まだ灯りがひとつ残っている。',
        status: 'active',
      }),
      supabase.from('characters').insert([
        {
          room_id: room.id,
          owner_id: userId,
          name: '蓮',
          archetype: '情報屋',
          color: '#000000',
          memo: '表向きは酒場の常連。相手の嘘に気づいても、すぐには指摘しない。',
        },
        {
          room_id: room.id,
          owner_id: null,
          name: '語り手',
          archetype: '進行',
          color: '#666666',
          memo: '場面描写、NPC、判定結果を担当する。',
        },
      ]),
    ]);
  }

  async function loadRoomData(userId: string, userEmail: string) {
    if (!supabase) return;

    const { data: allowedMember } = await supabase
      .from('allowed_members')
      .select('display_name')
      .eq('email', userEmail.toLowerCase())
      .eq('is_active', true)
      .maybeSingle();

    await supabase.from('profiles').upsert({
      id: userId,
      email: userEmail.toLowerCase(),
      display_name: allowedMember?.display_name ?? userEmail,
      updated_at: new Date().toISOString(),
    });

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, title, summary')
      .order('created_at', { ascending: true })
      .limit(1);

    if (roomsError) {
      setAuthMessage(roomsError.message);
      return;
    }

    const firstRoom = rooms?.[0];
    if (!firstRoom) {
      setAuthMessage('アクセス可能なルームがまだありません。room_members に追加してください。');
      return;
    }

    setSelectedRoomId(firstRoom.id);

    const [{ data: remoteScenes }, { data: remoteCharacters }, { data: remoteMessages }] = await Promise.all([
      supabase
        .from('scenes')
        .select('id, title, status, summary')
        .eq('room_id', firstRoom.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('characters')
        .select('id, name, archetype, color, memo, owner_id')
        .eq('room_id', firstRoom.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('rp_messages')
        .select('id, character_id, mode, body, created_at, profiles(display_name), characters(name)')
        .eq('room_id', firstRoom.id)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    if (remoteScenes?.length) {
      setScenes(remoteScenes as Scene[]);
      setSelectedSceneId(remoteScenes[0].id);
    }

    if (remoteCharacters?.length) {
      const mappedCharacters = remoteCharacters.map((character) => ({
        id: character.id,
        name: character.name,
        player: character.owner_id ? 'Player' : 'Shared',
        archetype: character.archetype,
        color: character.color,
        memo: character.memo,
      }));
      setCharacters(mappedCharacters);
      setSelectedCharacterId(mappedCharacters[0].id);
    }

    if (remoteMessages) {
      setMessages(
        remoteMessages.map((message) => {
          const characterRelation = Array.isArray(message.characters) ? message.characters[0] : message.characters;
          const profileRelation = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles;

          return {
            id: message.id,
            characterId: message.character_id,
            author: characterRelation?.name ?? profileRelation?.display_name ?? 'Unknown',
            mode: message.mode,
            body: message.body,
            createdAt: new Intl.DateTimeFormat('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(message.created_at)),
          };
        }),
      );
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthMessage(error.message);
  }

  async function handleMagicLink() {
    if (!supabase || !email || isMagicLinkSending || magicLinkCooldown > 0) return;

    setAuthMessage('');
    setIsMagicLinkSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectUrl || window.location.origin },
    });
    setIsMagicLinkSending(false);
    setMagicLinkCooldown(magicLinkCooldownSeconds);
    if (error) {
      setAuthMessage(
        error.message.toLowerCase().includes('rate limit')
          ? 'メール送信回数の上限に達しました。少し時間をおいてから、同じボタンを1回だけ押してください。'
          : error.message,
      );
      return;
    }
    setAuthMessage('ログインリンクを送信しました。届いた最新のメールだけを開いてください。');
  }

  async function handleSignOut() {
    if (!supabase) {
      setAuthState('demo');
      return;
    }
    await supabase.auth.signOut();
    setAuthState('signed-out');
    setCurrentUserId(null);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    if (supabase && authState === 'allowed' && selectedRoomId && currentUserId) {
      const { data, error } = await supabase
        .from('rp_messages')
        .insert({
          room_id: selectedRoomId,
          scene_id: selectedSceneId,
          character_id: mode === 'ic' ? activeCharacter.id : null,
          author_id: currentUserId,
          mode,
          body: trimmed,
        })
        .select('id, created_at')
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      const remoteMessage: RpMessage = {
        id: data.id,
        characterId: mode === 'ic' ? activeCharacter.id : null,
        author: mode === 'ic' ? activeCharacter.name : 'OOC',
        mode,
        body: trimmed,
        createdAt: new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(data.created_at),
        ),
      };

      setMessages((current) => [...current, remoteMessage]);
      setDraft('');
      return;
    }

    const nextMessage: RpMessage = {
      id: crypto.randomUUID(),
      characterId: mode === 'ic' ? activeCharacter.id : null,
      author: mode === 'ic' ? activeCharacter.name : 'OOC',
      mode,
      body: trimmed,
      createdAt: new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    };

    setMessages((current) => [...current, nextMessage]);
    setDraft('');
  }

  if (authState === 'checking') {
    return (
      <main className="center-screen">
        <div className="mark">Narikiri TRPG Room</div>
        <p>アクセス権を確認しています。</p>
      </main>
    );
  }

  if (authState === 'signed-out' || authState === 'blocked') {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-brand">
            <Lock size={22} />
            <span>Narikiri TRPG Room</span>
          </div>
          <h1 id="auth-title">招待されたメンバーだけが入れるRPスペース</h1>
          <p>
            Supabase Authでログインし、許可リストに登録されたメールアドレスだけがルームへ入れます。
          </p>
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              メールアドレス
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <label>
              パスワード
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>
            <button className="button-primary" type="submit">
              <DoorOpen size={17} />
              ログイン
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={handleMagicLink}
              disabled={isMagicLinkSending || magicLinkCooldown > 0}
            >
              <Mail size={17} />
              {magicLinkCooldown > 0
                ? `${magicLinkCooldown}秒後に再送`
                : isMagicLinkSending
                  ? '送信中'
                  : 'マジックリンクを送る'}
            </button>
          </form>
          {authState === 'blocked' && <p className="error">このメールアドレスは許可リストにありません。</p>}
          {authMessage && <p className="notice">{authMessage}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <MessageSquareText size={23} />
          <span>Narikiri TRPG Room</span>
        </div>
        <div className="topbar-meta">
          <span className="access-chip">
            <ShieldCheck size={14} />
            {authState === 'demo' ? 'DEMO MODE' : 'INVITED ONLY'}
          </span>
          <button className="icon-button" type="button" aria-label="ログアウト" onClick={handleSignOut}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail" aria-label="ルームナビゲーション">
          <section>
            <div className="section-title">
              <BookOpen size={16} />
              Scenes
            </div>
            <div className="scene-list">
              {scenes.map((scene) => (
                <button
                  className={scene.id === selectedSceneId ? 'scene-item selected' : 'scene-item'}
                  key={scene.id}
                  type="button"
                  onClick={() => setSelectedSceneId(scene.id)}
                >
                  <span>{scene.title}</span>
                  <small>{scene.status}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="section-title">
              <UserRound size={16} />
              Characters
            </div>
            <div className="character-list">
              {characters.map((character) => (
                <button
                  className={character.id === selectedCharacterId ? 'character-item selected' : 'character-item'}
                  key={character.id}
                  type="button"
                  onClick={() => setSelectedCharacterId(character.id)}
                >
                  <span className="avatar" style={{ backgroundColor: character.color }} />
                  <span>
                    <strong>{character.name}</strong>
                    <small>{character.archetype}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="conversation" aria-label="RPタイムライン">
          <div className="scene-hero">
            <div>
              <h1>{activeScene.title}</h1>
              <p>{activeScene.summary}</p>
            </div>
            <CinematicStrip />
          </div>

          <div className="timeline">
            {groupedMessages.map((message) => (
              <article className={message.mode === 'ooc' ? 'message ooc' : 'message'} key={message.id}>
                <div className="message-meta">
                  <span>{message.author}</span>
                  <small>{message.mode.toUpperCase()} / {message.createdAt}</small>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSend}>
            {authMessage && authState === 'allowed' && <p className="composer-notice">{authMessage}</p>}
            <div className="composer-controls">
              <select value={selectedCharacterId} onChange={(event) => setSelectedCharacterId(event.target.value)}>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <div className="segmented" aria-label="投稿モード">
                <button className={mode === 'ic' ? 'active' : ''} type="button" onClick={() => setMode('ic')}>
                  IC
                </button>
                <button className={mode === 'ooc' ? 'active' : ''} type="button" onClick={() => setMode('ooc')}>
                  OOC
                </button>
              </div>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="キャラクターとして発言する..."
              rows={3}
            />
            <button className="button-primary send-button" type="submit">
              <Send size={17} />
              送信
            </button>
          </form>
        </section>

        <aside className="right-panel" aria-label="メモ">
          <div className="section-title">
            <PanelRight size={16} />
            Inspector
          </div>
          <section className="memo-block">
            <h2>{activeCharacter.name}</h2>
            <p className="muted">{activeCharacter.player} / {activeCharacter.archetype}</p>
            <p>{activeCharacter.memo}</p>
          </section>
          <section className="memo-block">
            <h2>Scene Memo</h2>
            <p>{activeScene.summary}</p>
            <ul>
              <li>重要NPC: 店主</li>
              <li>未解決: 黒い封蝋の手紙</li>
              <li>次の焦点: 奥の扉</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function CinematicStrip() {
  return (
    <svg className="cinematic-strip" viewBox="0 0 520 120" role="img" aria-label="酒場のモノクロバナー">
      <rect width="520" height="120" fill="#000000" />
      <path d="M0 92 L62 72 L126 88 L190 54 L252 78 L324 38 L394 70 L520 40 L520 120 L0 120 Z" fill="#2F2F2F" />
      <path d="M48 82 H220 L190 34 H78 Z" fill="#FFFFFF" />
      <path d="M78 40 H190 L178 52 H90 Z" fill="#000000" />
      <rect x="98" y="58" width="32" height="22" fill="#000000" />
      <rect x="144" y="58" width="26" height="22" fill="#000000" />
      <path d="M272 92 L306 28 L340 92 Z" fill="#FFFFFF" />
      <rect x="302" y="58" width="10" height="34" fill="#000000" />
      <circle cx="422" cy="36" r="16" fill="#0057FF" />
      <path d="M376 92 C398 64 438 64 466 92 Z" fill="#FFFFFF" />
    </svg>
  );
}
