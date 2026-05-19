import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Archive,
  BookOpen,
  DoorOpen,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquareText,
  PanelRight,
  Plus,
  Save,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import { demoCharacters, demoMessages, demoScenes } from './demoData';
import type { Character, CoCBackground, CoCCharacteristics, CoCSkillMap, RpMessage, Scene } from './types';

type AuthState = 'checking' | 'signed-out' | 'allowed' | 'blocked' | 'demo';
type AccessRole = 'owner' | 'gm' | 'player' | 'viewer';
type AllowedMember = {
  email: string;
  display_name: string;
  role: AccessRole;
};

const authRedirectUrl = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim();
const magicLinkCooldownSeconds = 60;
const characteristicKeys: Array<keyof CoCCharacteristics> = ['str', 'con', 'siz', 'int', 'pow', 'dex', 'app', 'edu'];
const backgroundFields: Array<{ key: keyof CoCBackground; label: string }> = [
  { key: 'description', label: '外見・描写' },
  { key: 'ideology', label: '思想・信条' },
  { key: 'significantPeople', label: '重要な人物' },
  { key: 'meaningfulLocations', label: '意味のある場所' },
  { key: 'treasuredPossessions', label: '秘蔵品' },
  { key: 'traits', label: '特徴' },
  { key: 'injuries', label: '負傷・傷跡' },
  { key: 'phobias', label: '恐怖症・マニア' },
  { key: 'tomes', label: '魔導書・呪文' },
  { key: 'encounters', label: '遭遇した神話存在' },
];

const defaultCharacteristics: CoCCharacteristics = {
  str: 10,
  con: 10,
  siz: 10,
  int: 10,
  pow: 10,
  dex: 10,
  app: 10,
  edu: 10,
};

const defaultBackground: CoCBackground = {
  description: '',
  ideology: '',
  significantPeople: '',
  meaningfulLocations: '',
  treasuredPossessions: '',
  traits: '',
  injuries: '',
  phobias: '',
  tomes: '',
  encounters: '',
};

export function App() {
  const [authState, setAuthState] = useState<AuthState>(isSupabaseConfigured ? 'checking' : 'demo');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [currentAccessRole, setCurrentAccessRole] = useState<AccessRole | null>(null);
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
  const [characterDraft, setCharacterDraft] = useState<Character>(demoCharacters[0]);
  const [skillDraft, setSkillDraft] = useState(formatSkills(demoCharacters[0].skills));

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(async ({ data }) => {
      await handleAuthenticatedUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void handleAuthenticatedUser(session?.user ?? null);
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
  const activeDerived = deriveCoCValues(characterDraft);
  const canManageActiveCharacter =
    authState === 'demo' ||
    characterDraft.ownerId === currentUserId ||
    currentAccessRole === 'owner' ||
    currentAccessRole === 'gm';

  const groupedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        character: characters.find((character) => character.id === message.characterId),
      })),
    [characters, messages],
  );

  useEffect(() => {
    if (!activeCharacter) return;
    setCharacterDraft(activeCharacter);
    setSkillDraft(formatSkills(activeCharacter.skills));
  }, [activeCharacter?.id]);

  async function handleAuthenticatedUser(user: User | null) {
    if (!user) {
      setAuthState('signed-out');
      setCurrentUserId(null);
      setCurrentAccessRole(null);
      return;
    }

    if (!user.email) {
      setAuthMessage('Discordアカウントのメールアドレスを取得できませんでした。Discord側でメール認証を確認してください。');
      setAuthState('blocked');
      return;
    }

    setCurrentUserId(user.id);
    const allowedMember = await checkAllowed(user.email);
    setCurrentAccessRole(allowedMember?.role ?? null);
    if (allowedMember) await ensureMemberBootstrap(user.id, user.email, allowedMember);
    if (allowedMember) await loadRoomData(user.id, user.email);
    setAuthState(allowedMember ? 'allowed' : 'blocked');
  }

  async function checkAllowed(userEmail: string) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('allowed_members')
      .select('email, display_name, role')
      .eq('email', userEmail.toLowerCase())
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      setAuthMessage(error.message);
      return null;
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
          player_name: allowedMember.display_name,
          archetype: '私立探偵',
          color: '#000000',
          memo: '表向きは酒場の常連。相手の嘘に気づいても、すぐには指摘しない。',
          occupation: '私立探偵',
          age: '32',
          gender: '男性',
          residence: '東京',
          birthplace: '横浜',
          characteristics: defaultCharacteristics,
          skills: { 目星: 65, 聞き耳: 55, 図書館: 60, 心理学: 45, 説得: 50 },
          weapons: 'こぶし 50%, 拳銃 40%',
          possessions: '手帳、万年筆、古い鍵',
          background: defaultBackground,
          sanity_current: 50,
          hit_points_current: 10,
          magic_points_current: 10,
        },
        {
          room_id: room.id,
          owner_id: null,
          name: '語り手',
          player_name: 'GM',
          archetype: '進行',
          color: '#666666',
          memo: '場面描写、NPC、判定結果を担当する。',
          occupation: 'NPC',
          characteristics: defaultCharacteristics,
          skills: {},
          background: defaultBackground,
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
        .select(
          'id, name, player_name, archetype, color, memo, owner_id, occupation, age, gender, residence, birthplace, characteristics, skills, weapons, possessions, background, sanity_current, hit_points_current, magic_points_current, is_archived',
        )
        .eq('room_id', firstRoom.id)
        .eq('is_archived', false)
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
      const mappedCharacters = remoteCharacters.map((character) => {
        return normalizeCharacter({
          id: character.id,
          name: character.name,
          ownerId: character.owner_id,
          player: character.player_name ?? (character.owner_id ? 'Player' : 'Shared'),
          archetype: character.archetype,
          color: character.color,
          memo: character.memo,
          occupation: character.occupation,
          age: character.age,
          gender: character.gender,
          residence: character.residence,
          birthplace: character.birthplace,
          characteristics: character.characteristics,
          skills: character.skills,
          weapons: character.weapons,
          possessions: character.possessions,
          background: character.background,
          sanityCurrent: character.sanity_current,
          hitPointsCurrent: character.hit_points_current,
          magicPointsCurrent: character.magic_points_current,
          isArchived: character.is_archived,
        });
      });
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

  async function handleDiscordSignIn() {
    if (!supabase) return;

    setAuthMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: authRedirectUrl || window.location.origin,
        scopes: 'identify email',
      },
    });
    if (error) setAuthMessage(error.message);
  }

  async function handleSignOut() {
    if (!supabase) {
      setAuthState('demo');
      return;
    }
    await supabase.auth.signOut();
    setAuthState('signed-out');
    setCurrentUserId(null);
    setCurrentAccessRole(null);
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

  async function handleCreateCharacter() {
    const nextCharacter = createDefaultCharacter(currentUserId);

    if (supabase && authState === 'allowed' && selectedRoomId && currentUserId) {
      const { data, error } = await supabase
        .from('characters')
        .insert(toCharacterInsert(nextCharacter, selectedRoomId, currentUserId))
        .select(
          'id, name, player_name, archetype, color, memo, owner_id, occupation, age, gender, residence, birthplace, characteristics, skills, weapons, possessions, background, sanity_current, hit_points_current, magic_points_current, is_archived',
        )
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      const created = normalizeCharacter({
        id: data.id,
        name: data.name,
        ownerId: data.owner_id,
        player: data.player_name,
        archetype: data.archetype,
        color: data.color,
        memo: data.memo,
        occupation: data.occupation,
        age: data.age,
        gender: data.gender,
        residence: data.residence,
        birthplace: data.birthplace,
        characteristics: data.characteristics,
        skills: data.skills,
        weapons: data.weapons,
        possessions: data.possessions,
        background: data.background,
        sanityCurrent: data.sanity_current,
        hitPointsCurrent: data.hit_points_current,
        magicPointsCurrent: data.magic_points_current,
        isArchived: data.is_archived,
      });
      setCharacters((current) => [...current, created]);
      setSelectedCharacterId(created.id);
      setAuthMessage('探索者を作成しました。');
      return;
    }

    setCharacters((current) => [...current, nextCharacter]);
    setSelectedCharacterId(nextCharacter.id);
  }

  async function handleSaveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedSkills = parseSkills(skillDraft);
    const nextCharacter = normalizeCharacter({ ...characterDraft, skills: parsedSkills });

    if (supabase && authState === 'allowed' && selectedRoomId) {
      const { error } = await supabase
        .from('characters')
        .update(toCharacterUpdate(nextCharacter))
        .eq('id', nextCharacter.id)
        .eq('room_id', selectedRoomId);

      if (error) {
        setAuthMessage(error.message);
        return;
      }
      setAuthMessage('探索者を保存しました。');
    }

    setCharacters((current) =>
      current.map((character) => (character.id === nextCharacter.id ? nextCharacter : character)),
    );
    setCharacterDraft(nextCharacter);
    setSkillDraft(formatSkills(nextCharacter.skills));
  }

  async function handleArchiveCharacter() {
    if (!activeCharacter) return;

    if (supabase && authState === 'allowed' && selectedRoomId) {
      const { error } = await supabase
        .from('characters')
        .update({ is_archived: true })
        .eq('id', activeCharacter.id)
        .eq('room_id', selectedRoomId);

      if (error) {
        setAuthMessage(error.message);
        return;
      }
    }

    setCharacters((current) => {
      const nextCharacters = current.filter((character) => character.id !== activeCharacter.id);
      setSelectedCharacterId(nextCharacters[0]?.id ?? demoCharacters[0].id);
      return nextCharacters.length ? nextCharacters : [createDefaultCharacter(currentUserId)];
    });
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
            Supabase Authでログインし、許可リストに登録されたメールアドレスだけがルームへ入れます。Discordログインも同じ許可リストで制限します。
          </p>
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              メールアドレス
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                required
              />
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
            <button className="button-primary discord-button" type="button" onClick={handleDiscordSignIn}>
              <MessageCircle size={17} />
              Discordでログイン
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
            <button className="button-secondary rail-action" type="button" onClick={handleCreateCharacter}>
              <Plus size={16} />
              新規探索者
            </button>
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
            Investigator
          </div>
          <form className="character-editor" onSubmit={handleSaveCharacter}>
            <div className="editor-heading">
              <h2>{characterDraft.name}</h2>
              <span className="access-chip">{characterDraft.ownerId === currentUserId ? 'MY PC' : 'ROOM PC'}</span>
            </div>

            <div className="field-grid two">
              <label>
                名前
                <input
                  value={characterDraft.name}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, name: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                プレイヤー
                <input
                  value={characterDraft.player}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, player: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                職業
                <input
                  value={characterDraft.occupation}
                  onChange={(event) =>
                    setCharacterDraft({
                      ...characterDraft,
                      occupation: event.target.value,
                      archetype: event.target.value || characterDraft.archetype,
                    })
                  }
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                年齢
                <input
                  value={characterDraft.age}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, age: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                性別
                <input
                  value={characterDraft.gender}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, gender: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                色
                <input
                  value={characterDraft.color}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, color: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                住所
                <input
                  value={characterDraft.residence}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, residence: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                出身
                <input
                  value={characterDraft.birthplace}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, birthplace: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
            </div>

            <section className="editor-section">
              <h3>Characteristics</h3>
              <div className="stat-grid">
                {characteristicKeys.map((key) => (
                  <label key={key}>
                    {key.toUpperCase()}
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={characterDraft.characteristics[key]}
                      onChange={(event) =>
                        setCharacterDraft({
                          ...characterDraft,
                          characteristics: {
                            ...characterDraft.characteristics,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                      disabled={!canManageActiveCharacter}
                    />
                  </label>
                ))}
              </div>
              <div className="derived-grid">
                <span>Idea {activeDerived.idea}</span>
                <span>Luck {activeDerived.luck}</span>
                <span>Know {activeDerived.know}</span>
                <span>SAN Max {activeDerived.sanityMax}</span>
              </div>
            </section>

            <section className="editor-section">
              <h3>Status</h3>
              <div className="field-grid three">
                <label>
                  SAN
                  <input
                    type="number"
                    value={characterDraft.sanityCurrent}
                    onChange={(event) =>
                      setCharacterDraft({ ...characterDraft, sanityCurrent: Number(event.target.value) })
                    }
                    disabled={!canManageActiveCharacter}
                  />
                </label>
                <label>
                  HP / {activeDerived.hitPointsMax}
                  <input
                    type="number"
                    value={characterDraft.hitPointsCurrent}
                    onChange={(event) =>
                      setCharacterDraft({ ...characterDraft, hitPointsCurrent: Number(event.target.value) })
                    }
                    disabled={!canManageActiveCharacter}
                  />
                </label>
                <label>
                  MP / {activeDerived.magicPointsMax}
                  <input
                    type="number"
                    value={characterDraft.magicPointsCurrent}
                    onChange={(event) =>
                      setCharacterDraft({ ...characterDraft, magicPointsCurrent: Number(event.target.value) })
                    }
                    disabled={!canManageActiveCharacter}
                  />
                </label>
              </div>
            </section>

            <section className="editor-section">
              <h3>Skills</h3>
              <textarea
                value={skillDraft}
                onChange={(event) => setSkillDraft(event.target.value)}
                placeholder={'目星: 65\n聞き耳: 55\n図書館: 60'}
                disabled={!canManageActiveCharacter}
              />
            </section>

            <section className="editor-section">
              <h3>Equipment</h3>
              <label>
                武器
                <textarea
                  value={characterDraft.weapons}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, weapons: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
              <label>
                所持品
                <textarea
                  value={characterDraft.possessions}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, possessions: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
            </section>

            <section className="editor-section">
              <h3>Background</h3>
              {backgroundFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <textarea
                    value={characterDraft.background[field.key]}
                    onChange={(event) =>
                      setCharacterDraft({
                        ...characterDraft,
                        background: { ...characterDraft.background, [field.key]: event.target.value },
                      })
                    }
                    disabled={!canManageActiveCharacter}
                  />
                </label>
              ))}
              <label>
                メモ
                <textarea
                  value={characterDraft.memo}
                  onChange={(event) => setCharacterDraft({ ...characterDraft, memo: event.target.value })}
                  disabled={!canManageActiveCharacter}
                />
              </label>
            </section>

            <div className="editor-actions">
              <button className="button-primary" type="submit" disabled={!canManageActiveCharacter}>
                <Save size={16} />
                保存
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={handleArchiveCharacter}
                disabled={!canManageActiveCharacter}
              >
                <Archive size={16} />
                アーカイブ
              </button>
            </div>
          </form>
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

function normalizeCharacter(character: Partial<Character> & { id: string; name?: string }): Character {
  const characteristics = { ...defaultCharacteristics, ...(character.characteristics ?? {}) };
  const skills = normalizeSkills(character.skills);
  const sanityDefault = characteristics.pow * 5;
  const hitPointDefault = Math.ceil((characteristics.con + characteristics.siz) / 2);

  return {
    id: character.id,
    name: character.name ?? '新規探索者',
    ownerId: character.ownerId ?? null,
    player: character.player ?? '',
    archetype: character.archetype ?? character.occupation ?? '',
    color: character.color ?? '#090909',
    memo: character.memo ?? '',
    occupation: character.occupation ?? character.archetype ?? '',
    age: character.age ?? '',
    gender: character.gender ?? '',
    residence: character.residence ?? '',
    birthplace: character.birthplace ?? '',
    characteristics,
    skills,
    weapons: character.weapons ?? '',
    possessions: character.possessions ?? '',
    background: { ...defaultBackground, ...(character.background ?? {}) },
    sanityCurrent: Number(character.sanityCurrent ?? sanityDefault),
    hitPointsCurrent: Number(character.hitPointsCurrent ?? hitPointDefault),
    magicPointsCurrent: Number(character.magicPointsCurrent ?? characteristics.pow),
    isArchived: Boolean(character.isArchived),
  };
}

function createDefaultCharacter(ownerId: string | null): Character {
  const id = crypto.randomUUID();
  const characteristics = { ...defaultCharacteristics };
  return normalizeCharacter({
    id,
    ownerId,
    name: '新規探索者',
    player: '',
    archetype: '探索者',
    color: '#090909',
    occupation: '',
    characteristics,
    skills: {
      目星: 25,
      聞き耳: 25,
      図書館: 25,
      回避: characteristics.dex * 2,
      母国語: characteristics.edu * 5,
      クトゥルフ神話: 0,
    },
  });
}

function deriveCoCValues(character: Character) {
  const { con, siz, int, pow, edu } = character.characteristics;
  const cthulhuMythos = character.skills['クトゥルフ神話'] ?? character.skills['Cthulhu Mythos'] ?? 0;

  return {
    idea: int * 5,
    luck: pow * 5,
    know: edu * 5,
    sanityMax: Math.max(0, 99 - cthulhuMythos),
    hitPointsMax: Math.ceil((con + siz) / 2),
    magicPointsMax: pow,
  };
}

function normalizeSkills(skills: unknown): CoCSkillMap {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return {};

  return Object.fromEntries(
    Object.entries(skills as Record<string, unknown>)
      .map(([name, value]) => [name.trim(), Number(value)])
      .filter(([name, value]) => Boolean(name) && Number.isFinite(value)),
  );
}

function formatSkills(skills: CoCSkillMap) {
  return Object.entries(skills)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

function parseSkills(value: string): CoCSkillMap {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, rawValue] = line.split(/[:：]/);
        return [name.trim(), Number(rawValue)];
      })
      .filter(([name, score]) => Boolean(name) && Number.isFinite(score)),
  );
}

function toCharacterInsert(character: Character, roomId: string, ownerId: string) {
  return {
    ...toCharacterUpdate(character),
    room_id: roomId,
    owner_id: ownerId,
  };
}

function toCharacterUpdate(character: Character) {
  return {
    name: character.name,
    player_name: character.player,
    archetype: character.occupation || character.archetype,
    color: character.color,
    memo: character.memo,
    occupation: character.occupation,
    age: character.age,
    gender: character.gender,
    residence: character.residence,
    birthplace: character.birthplace,
    characteristics: character.characteristics,
    skills: character.skills,
    weapons: character.weapons,
    possessions: character.possessions,
    background: character.background,
    sanity_current: character.sanityCurrent,
    hit_points_current: character.hitPointsCurrent,
    magic_points_current: character.magicPointsCurrent,
    is_archived: character.isArchived,
  };
}
