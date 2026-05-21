import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Archive,
  BookOpen,
  Check,
  ClipboardCopy,
  DoorOpen,
  Pencil,
  Lock,
  LogOut,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  MessageSquareText,
  PanelRight,
  Plus,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UsersRound,
  UserRound,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  cocSkillDefinitions,
  createSkillMap,
  getSkillCategories,
  getSkillTotal,
  normalizeSkillEntry,
  resolveSkillBase,
} from './cocSkills';
import {
  archiveCharacterApi,
  createCharacterApi,
  fetchCharactersApi,
  updateCharacterApi,
  type CharacterRow,
} from './characterApi';
import { demoCharacters, demoMessages, demoRooms, demoScenes } from './demoData';
import type { Character, CoCBackground, CoCCharacteristics, CoCSkillEntry, CoCSkillMap, Room, RpMessage, Scene } from './types';

type AuthState = 'checking' | 'signed-out' | 'allowed' | 'blocked' | 'demo';
type AccessRole = 'owner' | 'gm' | 'player' | 'viewer';
type ViewMode = 'room' | 'rooms' | 'my-page' | 'tools';
type LogFormat = 'chat' | 'script' | 'markdown';
type SceneMapRecord = {
  sceneId: string;
  imageUrl: string;
};
type AllowedMember = {
  email?: string | null;
  discordUserId?: string | null;
  display_name: string;
  role: AccessRole;
};
type CharacterLike = Omit<Partial<Character>, 'characteristics' | 'skills' | 'background'> & {
  id: string;
  name?: string;
  characteristics?: unknown;
  skills?: unknown;
  background?: unknown;
};
type SceneDraft = Pick<Scene, 'id' | 'title' | 'summary' | 'status' | 'locationName' | 'timeLabel' | 'mapX' | 'mapY' | 'tags' | 'createdBy' | 'roomId' | 'createdAt'>;
type DerivedCoCValues = ReturnType<typeof deriveCoCValues>;

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
const skillCategories = getSkillCategories();
const demoUserId = 'demo-user';
const playerSpeakerId = 'speaker-player';

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
  const [rooms, setRooms] = useState<Room[]>(demoRooms);
  const [characters, setCharacters] = useState<Character[]>(demoCharacters);
  const [scenes, setScenes] = useState<Scene[]>(demoScenes);
  const [messages, setMessages] = useState<RpMessage[]>(demoMessages);
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0].id);
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0].id);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(demoRooms[0].id);
  const [currentView, setCurrentView] = useState<ViewMode>('room');
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [characterDraft, setCharacterDraft] = useState<Character>(demoCharacters[0]);
  const [roomDraft, setRoomDraft] = useState<Room>(demoRooms[0]);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>(demoScenes[0]);
  const [isRoomConfigOpen, setIsRoomConfigOpen] = useState(false);
  const [configuredSceneId, setConfiguredSceneId] = useState<string | null>(null);
  const [sceneMaps, setSceneMaps] = useState<SceneMapRecord[]>([]);
  const sceneMapsRef = useRef<SceneMapRecord[]>([]);
  const [mapPinLabel, setMapPinLabel] = useState('');
  const [selectedMapPinId, setSelectedMapPinId] = useState<string | null>(null);
  const [logFormat, setLogFormat] = useState<LogFormat>('chat');

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
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const roomScenes = scenes.filter((scene) => scene.roomId === activeRoom.id);
  const activeActorId = currentUserId ?? (authState === 'demo' ? demoUserId : null);
  const activeSceneMap = sceneMaps.find((sceneMap) => sceneMap.sceneId === activeRoom.id) ?? null;
  const scenePins = roomScenes.filter((scene) => scene.mapX !== null && scene.mapY !== null);
  const activeDerived = deriveCoCValues(characterDraft);
  const selectedMapPin = scenePins.find((scene) => scene.id === selectedMapPinId) ?? activeScene;
  const canManageActiveCharacter =
    authState === 'demo' ||
    characterDraft.ownerId === currentUserId ||
    currentAccessRole === 'owner' ||
    currentAccessRole === 'gm';
  const canEditActiveRoom = authState === 'demo' || activeRoom?.createdBy === currentUserId || currentAccessRole === 'owner';
  const canEditSceneDraft = authState === 'demo' || sceneDraft.createdBy === currentUserId;
  const recentScenes = roomScenes.slice(-3).reverse();
  const selectedSpeakerIsPlayer = selectedCharacterId === playerSpeakerId;
  const messageMode: 'ic' | 'ooc' = selectedSpeakerIsPlayer ? 'ooc' : 'ic';

  const groupedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        character: characters.find((character) => character.id === message.characterId),
      })),
    [characters, messages],
  );
  const formattedLog = useMemo(
    () => formatLog(groupedMessages, logFormat),
    [groupedMessages, logFormat],
  );

  useEffect(() => {
    if (!activeCharacter) return;
    setCharacterDraft(activeCharacter);
  }, [activeCharacter?.id]);

  useEffect(() => {
    if (!activeRoom) return;
    setRoomDraft(activeRoom);
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!activeScene) return;
    setSceneDraft(activeScene);
  }, [activeScene?.id]);

  useEffect(() => {
    const firstScene = scenes.find((scene) => scene.roomId === activeRoom.id);
    if (firstScene && !scenes.some((scene) => scene.id === selectedSceneId && scene.roomId === activeRoom.id)) {
      setSelectedSceneId(firstScene.id);
    }
  }, [activeRoom?.id, scenes, selectedSceneId]);

  useEffect(() => {
    sceneMapsRef.current = sceneMaps;
  }, [sceneMaps]);

  useEffect(() => {
    return () => {
      sceneMapsRef.current.forEach((sceneMap) => {
        if (sceneMap.imageUrl.startsWith('blob:')) URL.revokeObjectURL(sceneMap.imageUrl);
      });
    };
  }, []);

  useEffect(() => {
    setSelectedMapPinId(null);
  }, [selectedSceneId]);

  async function handleAuthenticatedUser(user: User | null) {
    if (!user) {
      setAuthState('signed-out');
      setCurrentUserId(null);
      setCurrentAccessRole(null);
      return;
    }

    const discordUserId = getDiscordUserId(user);
    const profileKey = getProfileKey(user, discordUserId);
    if (!profileKey) {
      setAuthMessage('ログイン元のメールアドレスまたは許可済みDiscord IDを確認できませんでした。');
      setAuthState('blocked');
      return;
    }

    setCurrentUserId(user.id);
    const allowedMember = await checkAllowed(user.email, discordUserId);
    setCurrentAccessRole(allowedMember?.role ?? null);
    if (allowedMember) await ensureMemberBootstrap(user.id, profileKey, allowedMember);
    if (allowedMember) await loadRoomData(user.id, profileKey, allowedMember);
    setAuthState(allowedMember ? 'allowed' : 'blocked');
  }

  async function checkAllowed(userEmail?: string, discordUserId?: string | null) {
    if (!supabase) return null;

    if (discordUserId) {
      const { data, error } = await supabase
        .from('allowed_discord_accounts')
        .select('discord_user_id, display_name, role')
        .eq('discord_user_id', discordUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        setAuthMessage(error.message);
        return null;
      }
      if (data) {
        return {
          discordUserId: data.discord_user_id,
          display_name: data.display_name,
          role: data.role,
        } as AllowedMember;
      }
    }

    if (!userEmail) return null;
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

  async function ensureMemberBootstrap(userId: string, profileKey: string, allowedMember: AllowedMember) {
    if (!supabase) return;

    await supabase.from('profiles').upsert({
      id: userId,
      email: profileKey,
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
        created_by: userId,
        title: '夜明け前の酒場',
        summary: '雨音が屋根を打つ。閉店後の酒場に、まだ灯りがひとつ残っている。',
        location_name: '酒場',
        time_label: '深夜',
        tags: ['導入', '屋内'],
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
          skills: createSkillMap(defaultCharacteristics, { 目星: 65, 聞き耳: 55, 図書館: 60, 心理学: 45, 説得: 50 }),
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
          skills: createSkillMap(defaultCharacteristics),
          background: defaultBackground,
        },
      ]),
    ]);
  }

  async function loadRoomData(userId: string, profileKey: string, allowedMember: AllowedMember) {
    if (!supabase) return;

    await supabase.from('profiles').upsert({
      id: userId,
      email: profileKey,
      display_name: allowedMember.display_name,
      updated_at: new Date().toISOString(),
    });

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, title, summary, tags, created_by')
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
    const mappedRooms = rooms.map(rowToRoom);
    setRooms(mappedRooms);
    setRoomDraft(mappedRooms[0]);

    const [{ data: remoteScenes }, remoteCharacters, { data: remoteMessages }] = await Promise.all([
      supabase
        .from('scenes')
        .select('id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at')
        .eq('room_id', firstRoom.id)
        .order('created_at', { ascending: true }),
      fetchCharactersApi(firstRoom.id).catch((error) => {
        setAuthMessage(error instanceof Error ? error.message : '探索者一覧を取得できませんでした。');
        return [] as CharacterRow[];
      }),
      supabase
        .from('rp_messages')
        .select('id, character_id, author_id, mode, body, created_at, profiles(display_name), characters(name)')
        .eq('room_id', firstRoom.id)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    if (remoteScenes?.length) {
      const mappedScenes = remoteScenes.map(rowToScene);
      setScenes(mappedScenes);
      setSelectedSceneId(mappedScenes[0].id);
      setSceneDraft(mappedScenes[0]);
    }

    if (remoteCharacters?.length) {
      const mappedCharacters = remoteCharacters.map(rowToCharacter);
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
            authorId: message.author_id,
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
          character_id: messageMode === 'ic' ? activeCharacter.id : null,
          author_id: currentUserId,
          mode: messageMode,
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
        characterId: messageMode === 'ic' ? activeCharacter.id : null,
        authorId: currentUserId,
        author: messageMode === 'ic' ? activeCharacter.name : '中の人',
        mode: messageMode,
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
      characterId: messageMode === 'ic' ? activeCharacter.id : null,
      authorId: activeActorId,
      author: messageMode === 'ic' ? activeCharacter.name : '中の人',
      mode: messageMode,
      body: trimmed,
      createdAt: new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    };

    setMessages((current) => [...current, nextMessage]);
    setDraft('');
  }

  function startEditMessage(message: RpMessage) {
    if (!canManageMessage(message)) return;
    setEditingMessageId(message.id);
    setEditingMessageDraft(message.body);
  }

  function cancelEditMessage() {
    setEditingMessageId(null);
    setEditingMessageDraft('');
  }

  async function saveEditedMessage(message: RpMessage) {
    if (!canManageMessage(message)) return;
    const trimmed = editingMessageDraft.trim();
    if (!trimmed) return;

    if (supabase && authState === 'allowed' && currentUserId) {
      const { error } = await supabase
        .from('rp_messages')
        .update({ body: trimmed })
        .eq('id', message.id)
        .eq('author_id', currentUserId);

      if (error) {
        setAuthMessage(error.message);
        return;
      }
    }

    setMessages((current) =>
      current.map((currentMessage) =>
        currentMessage.id === message.id ? { ...currentMessage, body: trimmed } : currentMessage,
      ),
    );
    cancelEditMessage();
  }

  async function deleteMessage(message: RpMessage) {
    if (!canManageMessage(message)) return;

    if (supabase && authState === 'allowed' && currentUserId) {
      const { error } = await supabase
        .from('rp_messages')
        .delete()
        .eq('id', message.id)
        .eq('author_id', currentUserId);

      if (error) {
        setAuthMessage(error.message);
        return;
      }
    }

    setMessages((current) => current.filter((currentMessage) => currentMessage.id !== message.id));
    if (editingMessageId === message.id) cancelEditMessage();
  }

  function canManageMessage(message: RpMessage) {
    return Boolean(activeActorId && message.authorId === activeActorId);
  }

  async function handleCreateCharacter() {
    const nextCharacter = createDefaultCharacter(currentUserId);
    setCurrentView('my-page');

    if (supabase && authState === 'allowed' && selectedRoomId && currentUserId) {
      try {
        const data = await createCharacterApi(selectedRoomId, nextCharacter);
        const created = rowToCharacter(data);
        setCharacters((current) => [...current, created]);
        setSelectedCharacterId(created.id);
        setAuthMessage('探索者を作成しました。');
        return;
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : '探索者を作成できませんでした。');
        return;
      }
    }

    setCharacters((current) => [...current, nextCharacter]);
    setSelectedCharacterId(nextCharacter.id);
  }

  async function handleSaveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCharacter = normalizeCharacter(characterDraft);

    if (supabase && authState === 'allowed' && selectedRoomId) {
      try {
        const data = await updateCharacterApi(selectedRoomId, nextCharacter);
        const saved = rowToCharacter(data);
        setCharacters((current) => current.map((character) => (character.id === saved.id ? saved : character)));
        setCharacterDraft(saved);
        setAuthMessage('探索者を保存しました。');
        return;
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : '探索者を保存できませんでした。');
        return;
      }
    }

    setCharacters((current) =>
      current.map((character) => (character.id === nextCharacter.id ? nextCharacter : character)),
    );
    setCharacterDraft(nextCharacter);
  }

  function handleMapUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const nextUrl = URL.createObjectURL(file);
    if (activeSceneMap?.imageUrl.startsWith('blob:')) URL.revokeObjectURL(activeSceneMap.imageUrl);
    setSceneMaps((current) => [
      ...current.filter((sceneMap) => sceneMap.sceneId !== activeRoom.id),
      { sceneId: activeRoom.id, imageUrl: nextUrl },
    ]);
    setSelectedMapPinId(null);
    event.target.value = '';
  }

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    if (!activeSceneMap) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    void assignSceneLocation(activeScene, x, y, mapPinLabel.trim());
    setSelectedMapPinId(activeScene.id);
    setMapPinLabel('');
  }

  function handleUseMapPin(scene: Scene) {
    setDraft((current) => `${current ? `${current}\n` : ''}@${scene.locationName || scene.title} `);
    setSelectedSceneId(scene.id);
    setCurrentView('room');
  }

  async function handleCopyLog() {
    try {
      await navigator.clipboard.writeText(formattedLog);
      setAuthMessage('整形ログをコピーしました。');
    } catch {
      setAuthMessage('クリップボードへコピーできませんでした。');
    }
  }

  async function handleArchiveCharacter() {
    if (!activeCharacter) return;

    if (supabase && authState === 'allowed' && selectedRoomId) {
      try {
        await archiveCharacterApi(selectedRoomId, activeCharacter.id);
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : '探索者をアーカイブできませんでした。');
        return;
      }
    }

    setCharacters((current) => {
      const nextCharacters = current.filter((character) => character.id !== activeCharacter.id);
      setSelectedCharacterId(nextCharacters[0]?.id ?? demoCharacters[0].id);
      return nextCharacters.length ? nextCharacters : [createDefaultCharacter(currentUserId)];
    });
  }

  async function handleSaveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRoom = {
      ...roomDraft,
      title: roomDraft.title.trim() || '無題のルーム',
      summary: roomDraft.summary.trim(),
      tags: normalizeTags(roomDraft.tags),
    };

    if (supabase && authState === 'allowed' && selectedRoomId && canEditActiveRoom) {
      const { data, error } = await supabase
        .from('rooms')
        .update({
          title: nextRoom.title,
          summary: nextRoom.summary,
          tags: nextRoom.tags,
        })
        .eq('id', selectedRoomId)
        .select('id, title, summary, tags, created_by')
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }
      const saved = rowToRoom(data);
      setRooms((current) => current.map((room) => (room.id === saved.id ? saved : room)));
      setRoomDraft(saved);
      setAuthMessage('ルームを保存しました。');
      return;
    }

    setRooms((current) => current.map((room) => (room.id === nextRoom.id ? nextRoom : room)));
    setRoomDraft(nextRoom);
  }

  async function handleCreateScene() {
    const targetRoomId = activeRoom.id;
    const nextScene = createDefaultScene(targetRoomId, activeActorId);

    if (supabase && authState === 'allowed' && targetRoomId && currentUserId) {
      const { data, error } = await supabase
        .from('scenes')
        .insert({
          room_id: targetRoomId,
          created_by: currentUserId,
          title: nextScene.title,
          summary: nextScene.summary,
          status: nextScene.status,
          location_name: nextScene.locationName,
          time_label: nextScene.timeLabel,
          map_x: nextScene.mapX,
          map_y: nextScene.mapY,
          tags: nextScene.tags,
        })
        .select('id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at')
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }
      const created = rowToScene(data);
      setScenes((current) => [...current, created]);
      setSelectedSceneId(created.id);
      setSceneDraft(created);
      setConfiguredSceneId(created.id);
      setIsRoomConfigOpen(false);
      setCurrentView('rooms');
      return;
    }

    setScenes((current) => [...current, nextScene]);
    setSelectedSceneId(nextScene.id);
    setSceneDraft(nextScene);
    setConfiguredSceneId(nextScene.id);
    setIsRoomConfigOpen(false);
    setCurrentView('rooms');
  }

  async function handleSaveScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditSceneDraft) return;
    const nextScene = normalizeScene(sceneDraft);

    if (supabase && authState === 'allowed' && selectedRoomId) {
      const { data, error } = await supabase
        .from('scenes')
        .update({
          title: nextScene.title,
          summary: nextScene.summary,
          status: nextScene.status,
          location_name: nextScene.locationName,
          time_label: nextScene.timeLabel,
          map_x: nextScene.mapX,
          map_y: nextScene.mapY,
          tags: nextScene.tags,
        })
        .eq('id', nextScene.id)
        .eq('created_by', currentUserId)
        .select('id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at')
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }
      const saved = rowToScene(data);
      setScenes((current) => current.map((scene) => (scene.id === saved.id ? saved : scene)));
      setSceneDraft(saved);
      setAuthMessage('シーンを保存しました。');
      return;
    }

    setScenes((current) => current.map((scene) => (scene.id === nextScene.id ? nextScene : scene)));
    setSceneDraft(nextScene);
  }

  async function assignSceneLocation(scene: Scene, x: number, y: number, locationName?: string) {
    const nextScene = { ...scene, mapX: x, mapY: y, locationName: locationName || scene.locationName };
    if (supabase && authState === 'allowed') {
      if (scene.createdBy !== currentUserId) return;
      const { data, error } = await supabase
        .from('scenes')
        .update({ map_x: x, map_y: y, location_name: nextScene.locationName })
        .eq('id', scene.id)
        .eq('created_by', currentUserId)
        .select('id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at')
        .single();

      if (error) {
        setAuthMessage(error.message);
        return;
      }
      const saved = rowToScene(data);
      setScenes((current) => current.map((currentScene) => (currentScene.id === saved.id ? saved : currentScene)));
      setSceneDraft(saved);
      return;
    }

    setScenes((current) => current.map((currentScene) => (currentScene.id === scene.id ? nextScene : currentScene)));
    setSceneDraft((current) => (current.id === scene.id ? nextScene : current));
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
            Supabase Authでログインし、許可リストに登録されたメールアドレスまたはDiscordアカウントだけがルームへ入れます。
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
          <div className="topbar-tabs" aria-label="表示切り替え">
            <button
              className={currentView === 'rooms' ? 'topbar-tab active' : 'topbar-tab'}
              type="button"
              onClick={() => {
                setIsRoomConfigOpen(false);
                setCurrentView('rooms');
              }}
            >
              <MessageSquareText size={16} />
              ルーム
            </button>
            <button
              className={currentView === 'my-page' ? 'topbar-tab active' : 'topbar-tab'}
              type="button"
              onClick={() => setCurrentView('my-page')}
            >
              <UserRound size={16} />
              マイページ
            </button>
            <button
              className={currentView === 'tools' ? 'topbar-tab active' : 'topbar-tab'}
              type="button"
              onClick={() => setCurrentView('tools')}
            >
              <Map size={16} />
              補助
            </button>
          </div>
          <button className="icon-button" type="button" aria-label="ログアウト" onClick={handleSignOut}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {currentView === 'rooms' ? (
        <section className="management-page" aria-label="ルームメニュー">
          <div className="my-page-header">
            <div>
              <p>Room Menu</p>
              <h1>ルーム</h1>
            </div>
          </div>
          <div className="management-grid">
            <aside className="character-manager-list" aria-label="ルーム一覧">
              <div className="section-title">
                <MessageSquareText size={16} />
                ルーム一覧
              </div>
              <div className="scene-list">
                {rooms.map((room) => (
                  <div
                    className={room.id === activeRoom.id ? 'scene-item selected' : 'scene-item'}
                    key={room.id}
                  >
                    <span>{room.title}</span>
                    <small>{room.tags.join(', ') || 'no tags'}</small>
                    <div className="inline-actions">
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => {
                          setSelectedRoomId(room.id);
                          setRoomDraft(room);
                          setCurrentView('room');
                        }}
                      >
                        入室
                      </button>
                      <button
                        className="mini-icon-button"
                        type="button"
                        onClick={() => {
                          setSelectedRoomId(room.id);
                          setRoomDraft(room);
                          setIsRoomConfigOpen((open) => (room.id === activeRoom.id ? !open : true));
                        }}
                        aria-label="ルーム設定"
                      >
                        <Settings size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
            {isRoomConfigOpen ? (
              <form className="tool-panel" onSubmit={handleSaveRoom}>
                <div className="tool-panel-header">
                  <div>
                    <p>Room Detail</p>
                    <h2>{roomDraft.title}</h2>
                  </div>
                  <button className="button-primary" type="submit" disabled={!canEditActiveRoom}>
                    <Save size={16} />
                    保存
                  </button>
                </div>
                <div className="field-grid two">
                  <label>
                    ルーム名
                    <input
                      value={roomDraft.title}
                      onChange={(event) => setRoomDraft({ ...roomDraft, title: event.target.value })}
                      disabled={!canEditActiveRoom}
                    />
                  </label>
                  <label>
                    タグ
                    <input
                      value={roomDraft.tags.join(', ')}
                      onChange={(event) => setRoomDraft({ ...roomDraft, tags: parseTags(event.target.value) })}
                      disabled={!canEditActiveRoom}
                      placeholder="導入, 1920s, 雨"
                    />
                  </label>
                </div>
                <label className="full-label">
                  概要
                  <textarea
                    value={roomDraft.summary}
                    onChange={(event) => setRoomDraft({ ...roomDraft, summary: event.target.value })}
                    disabled={!canEditActiveRoom}
                  />
                </label>
                <div className="tag-row">
                  {roomDraft.tags.map((tag) => (
                    <span className="access-chip" key={tag}>{tag}</span>
                  ))}
                </div>
              </form>
            ) : (
              <section className="tool-panel">
                <div className="tool-panel-header">
                  <div>
                    <p>Room Scenes</p>
                    <h2>{activeRoom.title}</h2>
                  </div>
                  <div className="panel-actions">
                    <button className="button-secondary" type="button" onClick={handleCreateScene}>
                      <Plus size={16} />
                      新規シーン
                    </button>
                    <button className="button-primary" type="button" onClick={() => setCurrentView('room')}>
                      <MessageSquareText size={16} />
                      入室
                    </button>
                  </div>
                </div>
                <p className="muted">{activeRoom.summary}</p>
                <div className="scene-list">
                  {roomScenes.map((scene) => (
                    <div
                      className={scene.id === selectedSceneId ? 'scene-item selected' : 'scene-item'}
                      key={scene.id}
                    >
                      <span>{scene.title}</span>
                      <small>{scene.locationName || '場所未設定'} / {scene.timeLabel || '時間未設定'}</small>
                      <div className="inline-actions">
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => {
                            setSelectedSceneId(scene.id);
                            setConfiguredSceneId(null);
                          }}
                        >
                          表示
                        </button>
                        {scene.createdBy === activeActorId && (
                          <button
                            className="mini-icon-button"
                            type="button"
                            onClick={() => {
                              setSelectedSceneId(scene.id);
                              setConfiguredSceneId(scene.id);
                            }}
                            aria-label="シーン設定"
                          >
                            <Settings size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {configuredSceneId === sceneDraft.id && canEditSceneDraft ? (
                  <form className="inline-editor" onSubmit={handleSaveScene}>
                    <div className="tool-panel-header">
                      <div>
                        <p>Scene Detail</p>
                        <h2>{sceneDraft.title}</h2>
                      </div>
                      <button className="button-primary" type="submit" disabled={!canEditSceneDraft}>
                        <Save size={16} />
                        保存
                      </button>
                    </div>
                    <div className="field-grid two">
                      <label>
                        シーン名
                        <input
                          value={sceneDraft.title}
                          onChange={(event) => setSceneDraft({ ...sceneDraft, title: event.target.value })}
                          disabled={!canEditSceneDraft}
                        />
                      </label>
                      <label>
                        場所
                        <input
                          value={sceneDraft.locationName}
                          onChange={(event) => setSceneDraft({ ...sceneDraft, locationName: event.target.value })}
                          disabled={!canEditSceneDraft}
                          placeholder="酒場、港の倉庫街など"
                        />
                      </label>
                      <label>
                        時間
                        <input
                          value={sceneDraft.timeLabel}
                          onChange={(event) => setSceneDraft({ ...sceneDraft, timeLabel: event.target.value })}
                          disabled={!canEditSceneDraft}
                          placeholder="深夜、翌朝、1923年春など"
                        />
                      </label>
                      <label>
                        状態
                        <select
                          value={sceneDraft.status}
                          onChange={(event) =>
                            setSceneDraft({ ...sceneDraft, status: event.target.value as Scene['status'] })
                          }
                          disabled={!canEditSceneDraft}
                        >
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="archived">archived</option>
                        </select>
                      </label>
                      <label>
                        タグ
                        <input
                          value={sceneDraft.tags.join(', ')}
                          onChange={(event) => setSceneDraft({ ...sceneDraft, tags: parseTags(event.target.value) })}
                          disabled={!canEditSceneDraft}
                          placeholder="探索, 屋内, 重要"
                        />
                      </label>
                    </div>
                    <div className="field-grid two">
                      <label>
                        マップX
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={sceneDraft.mapX ?? ''}
                          onChange={(event) =>
                            setSceneDraft({ ...sceneDraft, mapX: event.target.value === '' ? null : Number(event.target.value) })
                          }
                          disabled={!canEditSceneDraft}
                        />
                      </label>
                      <label>
                        マップY
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={sceneDraft.mapY ?? ''}
                          onChange={(event) =>
                            setSceneDraft({ ...sceneDraft, mapY: event.target.value === '' ? null : Number(event.target.value) })
                          }
                          disabled={!canEditSceneDraft}
                        />
                      </label>
                    </div>
                    <label className="full-label">
                      概要
                      <textarea
                        value={sceneDraft.summary}
                        onChange={(event) => setSceneDraft({ ...sceneDraft, summary: event.target.value })}
                        disabled={!canEditSceneDraft}
                      />
                    </label>
                  </form>
                ) : (
                  <section className="inline-editor" aria-label="選択中シーン">
                    <div className="tool-panel-header">
                      <div>
                        <p>Scene Detail</p>
                        <h2>{activeScene.title}</h2>
                      </div>
                      {activeScene.createdBy === activeActorId && (
                        <button className="button-secondary" type="button" onClick={() => setConfiguredSceneId(activeScene.id)}>
                          <Settings size={16} />
                          設定
                        </button>
                      )}
                    </div>
                    <div className="field-grid two">
                      <div className="read-field">
                        <span>場所</span>
                        <strong>{activeScene.locationName || '未設定'}</strong>
                      </div>
                      <div className="read-field">
                        <span>時間</span>
                        <strong>{activeScene.timeLabel || '未設定'}</strong>
                      </div>
                    </div>
                    <p>{activeScene.summary || '概要はまだありません。'}</p>
                    <div className="tag-row">
                      {activeScene.tags.map((tag) => (
                        <span className="access-chip" key={tag}>{tag}</span>
                      ))}
                    </div>
                  </section>
                )}
              </section>
            )}
          </div>
        </section>
      ) : currentView === 'my-page' ? (
        <section className="my-page" aria-label="マイページ">
          <div className="my-page-header">
            <div>
              <p>My Page</p>
              <h1>キャラクター管理</h1>
            </div>
            <button className="button-primary" type="button" onClick={handleCreateCharacter}>
              <Plus size={16} />
              新規キャラ作成
            </button>
          </div>

          <div className="character-manager">
            <aside className="character-manager-list" aria-label="キャラ一覧">
              <div className="section-title">
                <UsersRound size={16} />
                キャラ一覧
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
                      <small>{character.archetype || '探索者'}</small>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <CharacterEditor
              activeDerived={activeDerived}
              canManageActiveCharacter={canManageActiveCharacter}
              characterDraft={characterDraft}
              currentUserId={currentUserId}
              onArchive={handleArchiveCharacter}
              onSave={handleSaveCharacter}
              setCharacterDraft={setCharacterDraft}
            />
          </div>
        </section>
      ) : currentView === 'tools' ? (
        <section className="tools-page" aria-label="世界観補助">
          <div className="my-page-header">
            <div>
              <p>World Support</p>
              <h1>世界観補助</h1>
            </div>
          </div>

          <div className="tools-grid">
            <section className="tool-panel" aria-label="マップ作成">
              <div className="tool-panel-header">
                <div>
                  <p>Map Board</p>
                  <h2>マップ作成</h2>
                </div>
                <label className="button-secondary upload-button">
                  <Upload size={16} />
                  画像アップロード
                  <input type="file" accept="image/*" onChange={handleMapUpload} />
                </label>
              </div>
              <div className="field-grid two">
                <label>
                  配置するシーン
                  <select value={selectedSceneId} onChange={(event) => setSelectedSceneId(event.target.value)}>
                    {roomScenes.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  場所名
                  <input
                    value={mapPinLabel}
                    onChange={(event) => setMapPinLabel(event.target.value)}
                    placeholder={activeScene.locationName || '奥の扉前'}
                  />
                </label>
                <label>
                  ルーム
                  <input value={activeRoom.title} readOnly />
                </label>
              </div>
              <div
                className={activeSceneMap ? 'map-canvas has-image' : 'map-canvas'}
                role="button"
                tabIndex={0}
                onClick={handleMapClick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
                }}
              >
                {activeSceneMap ? (
                  <>
                    <img src={activeSceneMap.imageUrl} alt={`${activeRoom.title}のマップ`} />
                    {scenePins.map((pin) => (
                      <button
                        className={pin.id === selectedMapPin?.id ? 'map-pin active' : 'map-pin'}
                        key={pin.id}
                        type="button"
                        style={{ left: `${pin.mapX}%`, top: `${pin.mapY}%` }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMapPinId(pin.id);
                          setSelectedSceneId(pin.id);
                        }}
                        aria-label={pin.title}
                      >
                        <MapPin size={15} />
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="empty-map">
                    <Map size={32} />
                    <span>マップ未設定</span>
                  </div>
                )}
              </div>
              {selectedMapPin && (
                <div className="pin-detail">
                  <div>
                    <strong>{selectedMapPin.locationName || selectedMapPin.title}</strong>
                    <span>
                      {selectedMapPin.title} / {selectedMapPin.tags.join(', ') || 'no tags'}
                    </span>
                  </div>
                  <button className="button-secondary" type="button" onClick={() => handleUseMapPin(selectedMapPin)}>
                    <MessageSquareText size={16} />
                    この地点で話す
                  </button>
                </div>
              )}
            </section>

            <section className="tool-panel" aria-label="ログ整形">
              <div className="tool-panel-header">
                <div>
                  <p>Session Log</p>
                  <h2>ログ整形</h2>
                </div>
                <button className="button-secondary" type="button" onClick={handleCopyLog}>
                  <ClipboardCopy size={16} />
                  コピー
                </button>
              </div>
              <div className="segmented segmented-wide" aria-label="ログ形式">
                <button className={logFormat === 'chat' ? 'active' : ''} type="button" onClick={() => setLogFormat('chat')}>
                  Chat
                </button>
                <button className={logFormat === 'script' ? 'active' : ''} type="button" onClick={() => setLogFormat('script')}>
                  Script
                </button>
                <button className={logFormat === 'markdown' ? 'active' : ''} type="button" onClick={() => setLogFormat('markdown')}>
                  MD
                </button>
              </div>
              <textarea className="log-output" value={formattedLog} readOnly />
            </section>
          </div>
        </section>
      ) : (
      <div className="workspace">
        <aside className="left-rail" aria-label="ルームナビゲーション">
          <section>
            <div className="section-title">
              <BookOpen size={16} />
              Recent Scenes
            </div>
            <button className="button-secondary rail-action" type="button" onClick={() => setCurrentView('rooms')}>
              <BookOpen size={16} />
              ルームのシーン一覧
            </button>
            <div className="scene-list">
              {recentScenes.map((scene) => (
                <button
                  className={scene.id === selectedSceneId ? 'scene-item selected' : 'scene-item'}
                  key={scene.id}
                  type="button"
                  onClick={() => setSelectedSceneId(scene.id)}
                >
                  <span>{scene.title}</span>
                  <small>{scene.locationName || scene.status}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="section-title">
              <UserRound size={16} />
              Characters
            </div>
            <button className="button-secondary rail-action" type="button" onClick={() => setCurrentView('my-page')}>
              <UserRound size={16} />
              マイページで管理
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
                  <div className="message-meta-actions">
                    <small>{message.mode.toUpperCase()} / {message.createdAt}</small>
                    {canManageMessage(message) && (
                      <span className="message-actions">
                        <button
                          className="mini-icon-button"
                          type="button"
                          onClick={() => startEditMessage(message)}
                          aria-label="発言を編集"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="mini-icon-button"
                          type="button"
                          onClick={() => deleteMessage(message)}
                          aria-label="発言を削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                {editingMessageId === message.id ? (
                  <div className="message-editor">
                    <textarea
                      value={editingMessageDraft}
                      onChange={(event) => setEditingMessageDraft(event.target.value)}
                      rows={3}
                    />
                    <div className="editor-actions compact">
                      <button className="button-primary" type="button" onClick={() => saveEditedMessage(message)}>
                        <Check size={16} />
                        保存
                      </button>
                      <button className="button-secondary" type="button" onClick={cancelEditMessage}>
                        <X size={16} />
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{message.body}</p>
                )}
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSend}>
            {authMessage && authState === 'allowed' && <p className="composer-notice">{authMessage}</p>}
            <div className="composer-controls">
              <select value={selectedCharacterId} onChange={(event) => setSelectedCharacterId(event.target.value)}>
                <option value={playerSpeakerId}>中の人</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <span className="access-chip">{messageMode === 'ic' ? 'キャラクター発言' : '中の人'}</span>
            </div>
            <p className="mode-help">キャラ名を選ぶとキャラクター発言、中の人を選ぶとプレイヤー発言です。</p>
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
            Scene Memo
          </div>
          <section className="memo-block">
            <h2>Scene Memo</h2>
            <p>{activeScene.summary}</p>
            <ul>
              <li>重要NPC: 店主</li>
              <li>未解決: 黒い封蝋の手紙</li>
              <li>次の焦点: 奥の扉</li>
            </ul>
          </section>
          <section className="memo-block">
            <h2>Scene Map</h2>
            {activeSceneMap ? (
              <div className="scene-map-preview">
                <img src={activeSceneMap.imageUrl} alt={`${activeRoom.title}のマップ`} />
                <span>{scenePins.length} scene pins</span>
              </div>
            ) : (
              <p>このルームにはまだマップがありません。</p>
            )}
            <button className="button-secondary rail-action" type="button" onClick={() => setCurrentView('tools')}>
              <Map size={16} />
              マップを設定
            </button>
          </section>
        </aside>
      </div>
      )}
    </main>
  );
}

function CharacterEditor({
  activeDerived,
  canManageActiveCharacter,
  characterDraft,
  currentUserId,
  onArchive,
  onSave,
  setCharacterDraft,
}: {
  activeDerived: DerivedCoCValues;
  canManageActiveCharacter: boolean;
  characterDraft: Character;
  currentUserId: string | null;
  onArchive: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  setCharacterDraft: Dispatch<SetStateAction<Character>>;
}) {
  const occupationBudget = characterDraft.characteristics.edu * 20;
  const interestBudget = characterDraft.characteristics.int * 10;
  const occupationUsed = Object.values(characterDraft.skills).reduce((sum, skill) => sum + skill.occupation, 0);
  const interestUsed = Object.values(characterDraft.skills).reduce((sum, skill) => sum + skill.interest, 0);

  function updateSkill(name: string, field: keyof Omit<CoCSkillEntry, 'base'>, value: number) {
    setCharacterDraft((current) => {
      const definition = cocSkillDefinitions.find((skill) => skill.name === name);
      const base = definition ? resolveSkillBase(definition.base, current.characteristics) : 0;
      const currentEntry = current.skills[name] ?? normalizeSkillEntry(undefined, base);
      return {
        ...current,
        skills: {
          ...current.skills,
          [name]: {
            ...currentEntry,
            base,
            [field]: clampSkillPoint(value),
          },
        },
      };
    });
  }

  return (
    <form className="character-editor character-editor-page" onSubmit={onSave}>
      <div className="editor-heading">
        <div>
          <p>Character Sheet</p>
          <h2>{characterDraft.name}</h2>
        </div>
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
              onChange={(event) => setCharacterDraft({ ...characterDraft, sanityCurrent: Number(event.target.value) })}
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
        <div className="point-ledger">
          <span>職業 {occupationUsed} / {occupationBudget}</span>
          <span>興味 {interestUsed} / {interestBudget}</span>
        </div>
        <div className="skill-table" role="table" aria-label="CoC 6th edition skills">
          <div className="skill-row skill-head" role="row">
            <span>技能</span>
            <span>初期</span>
            <span>職業</span>
            <span>興味</span>
            <span>成長</span>
            <span>他</span>
            <span>合計</span>
          </div>
          {skillCategories.map((category) => (
            <div className="skill-category" key={category}>
              <div className="skill-category-title">{category}</div>
              {cocSkillDefinitions
                .filter((definition) => definition.category === category)
                .map((definition) => {
                  const base = resolveSkillBase(definition.base, characterDraft.characteristics);
                  const entry = characterDraft.skills[definition.name] ?? normalizeSkillEntry(undefined, base);
                  const normalizedEntry = entry.base === base ? entry : { ...entry, base };
                  return (
                    <div className="skill-row" role="row" key={definition.name}>
                      <span>{definition.name}</span>
                      <span>{base}</span>
                      {(['occupation', 'interest', 'growth', 'other'] as const).map((field) => (
                        <input
                          key={field}
                          type="number"
                          min="0"
                          max="999"
                          value={normalizedEntry[field]}
                          onChange={(event) => updateSkill(definition.name, field, Number(event.target.value))}
                          disabled={!canManageActiveCharacter}
                          aria-label={`${definition.name} ${field}`}
                        />
                      ))}
                      <strong>{getSkillTotal(normalizedEntry)}</strong>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
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
        <button className="button-secondary" type="button" onClick={onArchive} disabled={!canManageActiveCharacter}>
          <Archive size={16} />
          アーカイブ
        </button>
      </div>
    </form>
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

function getDiscordUserId(user: User) {
  const discordIdentity = user.identities?.find((identity) => identity.provider === 'discord');
  const identityData = discordIdentity?.identity_data;
  const providerId = identityData?.provider_id ?? identityData?.sub ?? discordIdentity?.id;
  return providerId ? String(providerId) : null;
}

function getProfileKey(user: User, discordUserId: string | null) {
  if (discordUserId) return `discord:${discordUserId}`;
  return user.email ? user.email.toLowerCase() : null;
}

function rowToRoom(room: {
  id: string;
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  created_by?: string | null;
}): Room {
  return {
    id: room.id,
    title: room.title,
    summary: room.summary ?? '',
    tags: normalizeTags(room.tags),
    createdBy: room.created_by ?? null,
  };
}

function rowToScene(scene: {
  id: string;
  room_id?: string | null;
  created_by?: string | null;
  title: string;
  status?: string | null;
  summary?: string | null;
  location_name?: string | null;
  time_label?: string | null;
  map_x?: number | string | null;
  map_y?: number | string | null;
  tags?: string[] | null;
  created_at?: string | null;
}): Scene {
  return normalizeScene({
    id: scene.id,
    roomId: scene.room_id ?? null,
    createdBy: scene.created_by ?? null,
    title: scene.title,
    status: scene.status === 'paused' || scene.status === 'archived' ? scene.status : 'active',
    summary: scene.summary ?? '',
    locationName: scene.location_name ?? '',
    timeLabel: scene.time_label ?? '',
    mapX: toMapCoordinate(scene.map_x),
    mapY: toMapCoordinate(scene.map_y),
    tags: normalizeTags(scene.tags),
    createdAt: scene.created_at ?? null,
  });
}

function rowToCharacter(character: CharacterRow): Character {
  return normalizeCharacter({
    id: character.id,
    name: character.name,
    ownerId: character.owner_id,
    player: character.player_name ?? (character.owner_id ? 'Player' : 'Shared'),
    archetype: character.archetype ?? '',
    color: character.color ?? '#090909',
    memo: character.memo ?? '',
    occupation: character.occupation ?? '',
    age: character.age ?? '',
    gender: character.gender ?? '',
    residence: character.residence ?? '',
    birthplace: character.birthplace ?? '',
    characteristics: character.characteristics,
    skills: character.skills,
    weapons: character.weapons ?? '',
    possessions: character.possessions ?? '',
    background: character.background,
    sanityCurrent: character.sanity_current ?? undefined,
    hitPointsCurrent: character.hit_points_current ?? undefined,
    magicPointsCurrent: character.magic_points_current ?? undefined,
    isArchived: character.is_archived ?? false,
  });
}

function normalizeCharacter(character: CharacterLike): Character {
  const characteristicsInput =
    character.characteristics && typeof character.characteristics === 'object' && !Array.isArray(character.characteristics)
      ? (character.characteristics as Partial<CoCCharacteristics>)
      : {};
  const backgroundInput =
    character.background && typeof character.background === 'object' && !Array.isArray(character.background)
      ? (character.background as Partial<CoCBackground>)
      : {};
  const characteristics = { ...defaultCharacteristics, ...characteristicsInput };
  const skills = normalizeSkills(character.skills, characteristics);
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
    background: { ...defaultBackground, ...backgroundInput },
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
    skills: createSkillMap(characteristics),
  });
}

function createDefaultScene(roomId: string | null, creatorId: string | null): Scene {
  return normalizeScene({
    id: crypto.randomUUID(),
    roomId,
    createdBy: creatorId,
    title: '新規シーン',
    status: 'active',
    summary: '',
    locationName: '',
    timeLabel: '',
    mapX: null,
    mapY: null,
    tags: [],
    createdAt: new Date().toISOString(),
  });
}

function normalizeScene(scene: SceneDraft): Scene {
  return {
    id: scene.id,
    roomId: scene.roomId ?? null,
    createdBy: scene.createdBy ?? null,
    title: scene.title.trim() || '無題のシーン',
    status: scene.status,
    summary: scene.summary.trim(),
    locationName: scene.locationName.trim(),
    timeLabel: scene.timeLabel.trim(),
    mapX: toMapCoordinate(scene.mapX),
    mapY: toMapCoordinate(scene.mapY),
    tags: normalizeTags(scene.tags),
    createdAt: scene.createdAt ?? null,
  };
}

function deriveCoCValues(character: Character) {
  const { con, siz, int, pow, edu } = character.characteristics;
  const cthulhuMythos = getSkillTotal(character.skills['クトゥルフ神話']);

  return {
    idea: int * 5,
    luck: pow * 5,
    know: edu * 5,
    sanityMax: Math.max(0, 99 - cthulhuMythos),
    hitPointsMax: Math.ceil((con + siz) / 2),
    magicPointsMax: pow,
  };
}

function normalizeSkills(skills: unknown, characteristics: CoCCharacteristics): CoCSkillMap {
  const input = skills && typeof skills === 'object' && !Array.isArray(skills) ? (skills as Record<string, unknown>) : {};
  return Object.fromEntries(
    cocSkillDefinitions.map((definition) => {
      const base = resolveSkillBase(definition.base, characteristics);
      return [definition.name, normalizeSkillEntry(input[definition.name], base)];
    }),
  );
}

function clampSkillPoint(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(999, Math.max(0, Math.trunc(value)));
}

function parseTags(value: string) {
  return normalizeTags(value.split(/[,\n、]/));
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12))];
}

function toMapCoordinate(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function formatLog(messages: Array<RpMessage & { character?: Character }>, format: LogFormat) {
  if (format === 'script') {
    return messages.map((message) => `${message.author}: ${message.body}`).join('\n');
  }
  if (format === 'markdown') {
    return messages
      .map((message) => `- **${message.author}** (${message.mode.toUpperCase()} / ${message.createdAt})\n  ${message.body}`)
      .join('\n');
  }
  return messages
    .map((message) => `[${message.createdAt}] ${message.mode.toUpperCase()} ${message.author}: ${message.body}`)
    .join('\n');
}
