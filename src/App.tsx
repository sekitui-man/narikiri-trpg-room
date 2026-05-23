import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  Pencil,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquareText,
  PanelRight,
  Plus,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
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
import {
  createMessageApi,
  createRoomApi,
  createSceneApi,
  deleteMessageApi,
  deleteRoomApi,
  deleteSceneApi,
  updateMessageApi,
  updateRoomApi,
  updateSceneApi,
} from './roomApi';
import { demoCharacters, demoMessages, demoRooms, demoScenes } from './demoData';
import type { Character, CoCBackground, CoCCharacteristics, CoCSkillEntry, CoCSkillMap, Room, RpMessage, Scene } from './types';

type AuthState = 'checking' | 'signed-out' | 'allowed' | 'blocked' | 'demo';
type AccessRole = 'owner' | 'gm' | 'player' | 'viewer';
type ViewMode = 'room' | 'rooms' | 'room-scenes' | 'my-page' | 'admin';
type RoomSettingsTab = 'basic' | 'permissions';
type SceneSettingsTab = 'basic' | 'permissions';
type AllowedMember = {
  email?: string | null;
  discordUserId?: string | null;
  display_name: string;
  role: AccessRole;
};
type AllowedAccount = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  role: AccessRole;
  isActive: boolean;
};
type RoomMember = {
  roomId: string;
  userId: string;
  displayName: string;
  discordUserId?: string | null;
  role: AccessRole;
};
type RoomScenePermission = {
  roomId: string;
  userId: string;
  canCreateScenes: boolean;
  canDeleteScenes: boolean;
};
type SceneEditPermission = {
  sceneId: string;
  userId: string;
};
type DiscordProfile = {
  id: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const demoRoomMembers: RoomMember[] = [
  { roomId: 'room-demo', userId: 'demo-guest', displayName: 'Guest', discordUserId: '000000000000000001', role: 'player' },
  { roomId: 'room-demo', userId: 'demo-gm', displayName: 'GM', discordUserId: '000000000000000002', role: 'gm' },
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

const emptyRoom: Room = {
  id: '',
  title: 'ルーム未選択',
  summary: '',
  tags: [],
  createdBy: null,
};

const emptyScene: Scene = {
  id: '',
  roomId: null,
  createdBy: null,
  title: 'シーン未選択',
  status: 'active',
  summary: '',
  locationName: '',
  timeLabel: '',
  mapX: null,
  mapY: null,
  tags: [],
  createdAt: null,
};

export function App() {
  const [authState, setAuthState] = useState<AuthState>(isSupabaseConfigured ? 'checking' : 'demo');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; id: number } | null>(null);
  const [currentAccessRole, setCurrentAccessRole] = useState<AccessRole | null>(null);
  const [discordProfile, setDiscordProfile] = useState<DiscordProfile | null>(null);
  const [rooms, setRooms] = useState<Room[]>(() => (isSupabaseConfigured ? [] : demoRooms));
  const [characters, setCharacters] = useState<Character[]>(() => (isSupabaseConfigured ? [] : demoCharacters));
  const [scenes, setScenes] = useState<Scene[]>(() => (isSupabaseConfigured ? [] : demoScenes));
  const [messages, setMessages] = useState<RpMessage[]>(() => (isSupabaseConfigured ? [] : demoMessages));
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>(() => (isSupabaseConfigured ? [] : demoRoomMembers));
  const [roomScenePermissions, setRoomScenePermissions] = useState<RoomScenePermission[]>([]);
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set());
  const [sceneEditPermissions, setSceneEditPermissions] = useState<SceneEditPermission[]>([]);
  const [selectedRoomPermissionUserId, setSelectedRoomPermissionUserId] = useState('');
  const [roomPermissionDraft, setRoomPermissionDraft] = useState({ canCreateScenes: false, canDeleteScenes: false });
  const [selectedSceneEditorUserId, setSelectedSceneEditorUserId] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState(isSupabaseConfigured ? '' : demoCharacters[0].id);
  const [selectedSceneId, setSelectedSceneId] = useState(isSupabaseConfigured ? '' : demoScenes[0].id);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(isSupabaseConfigured ? null : demoRooms[0].id);
  const [currentView, setCurrentView] = useState<ViewMode>(isSupabaseConfigured ? 'rooms' : 'room');
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [characterDraft, setCharacterDraft] = useState<Character>(() =>
    isSupabaseConfigured ? createDefaultCharacter(null) : demoCharacters[0],
  );
  const [roomDraft, setRoomDraft] = useState<Room>(() => (isSupabaseConfigured ? emptyRoom : demoRooms[0]));
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>(() => (isSupabaseConfigured ? emptyScene : demoScenes[0]));
  const [isRoomConfigOpen, setIsRoomConfigOpen] = useState(false);
  const [configuredSceneId, setConfiguredSceneId] = useState<string | null>(null);
  const [roomSettingsTab, setRoomSettingsTab] = useState<RoomSettingsTab>('basic');
  const [sceneSettingsTab, setSceneSettingsTab] = useState<SceneSettingsTab>('basic');
  const [isRoomNavOpen, setIsRoomNavOpen] = useState(true);
  const [allowedDiscordDraft, setAllowedDiscordDraft] = useState({
    discordUserId: '',
    role: 'player' as AccessRole,
  });
  const [allowedAccounts, setAllowedAccounts] = useState<AllowedAccount[]>([]);
  const [selectedAdminAccountId, setSelectedAdminAccountId] = useState<string | null>(null);
  const [adminDetailDraft, setAdminDetailDraft] = useState<{ role: AccessRole; isActive: boolean } | null>(null);

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

  const activeCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? characterDraft;
  const activeScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0] ?? emptyScene;
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? emptyRoom;
  const roomScenes = scenes.filter((scene) => scene.roomId === activeRoom.id);
  const activeActorId = currentUserId ?? (authState === 'demo' ? demoUserId : null);
  const activeRoomMembers = roomMembers.filter((member) => member.roomId === activeRoom.id && member.userId !== currentUserId);
  const activeRoomScenePermission = roomScenePermissions.find(
    (permission) => permission.roomId === activeRoom.id && permission.userId === activeActorId,
  );
  const activeDerived = deriveCoCValues(characterDraft);
  const activeRoomIdIsUuid = isUuid(activeRoom?.id);
  const selectedRoomIdIsUuid = isUuid(selectedRoomId);
  const canManageActiveCharacter =
    authState === 'demo' ||
    characterDraft.ownerId === currentUserId ||
    currentAccessRole === 'owner' ||
    currentAccessRole === 'gm';
  const canEditActiveRoom = authState === 'demo' || activeRoom?.createdBy === currentUserId || currentAccessRole === 'owner';
  const canManageRoomScenePermissions = authState === 'demo' || activeRoom.createdBy === currentUserId;
  const canCreateActiveRoomScene =
    authState === 'demo' || activeRoom.createdBy === currentUserId || Boolean(activeRoomScenePermission?.canCreateScenes);
  const canEditSceneDraft =
    authState === 'demo' ||
    sceneDraft.createdBy === currentUserId ||
    sceneEditPermissions.some((permission) => permission.sceneId === sceneDraft.id && permission.userId === currentUserId);
  const canGrantSceneDraftEditors = authState === 'demo' || sceneDraft.createdBy === currentUserId;
  const recentScenes = roomScenes.slice(-3).reverse();
  const selectedSpeakerIsPlayer = selectedCharacterId === playerSpeakerId;
  const messageMode: 'ic' | 'ooc' = selectedSpeakerIsPlayer ? 'ooc' : 'ic';
  const canDeleteRoom = (room: Room) =>
    authState === 'demo' || room.createdBy === currentUserId || currentAccessRole === 'owner';
  const canDeleteScene = (scene: Scene) =>
    authState === 'demo' ||
    activeRoom.createdBy === currentUserId ||
    scene.createdBy === currentUserId ||
    Boolean(activeRoomScenePermission?.canDeleteScenes);
  const canEditScene = (scene: Scene) =>
    authState === 'demo' ||
    scene.createdBy === currentUserId ||
    sceneEditPermissions.some((permission) => permission.sceneId === scene.id && permission.userId === currentUserId);

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
    if (!activeRoomMembers.length) {
      setSelectedRoomPermissionUserId('');
      setSelectedSceneEditorUserId('');
      return;
    }

    setSelectedRoomPermissionUserId((current) =>
      activeRoomMembers.some((member) => member.userId === current) ? current : activeRoomMembers[0].userId,
    );
    setSelectedSceneEditorUserId((current) =>
      activeRoomMembers.some((member) => member.userId === current) ? current : activeRoomMembers[0].userId,
    );
  }, [activeRoom.id, roomMembers, currentUserId]);

  useEffect(() => {
    const permission = roomScenePermissions.find(
      (currentPermission) =>
        currentPermission.roomId === activeRoom.id && currentPermission.userId === selectedRoomPermissionUserId,
    );
    setRoomPermissionDraft({
      canCreateScenes: Boolean(permission?.canCreateScenes),
      canDeleteScenes: Boolean(permission?.canDeleteScenes),
    });
  }, [activeRoom.id, roomScenePermissions, selectedRoomPermissionUserId]);

  useEffect(() => {
    const firstScene = scenes.find((scene) => scene.roomId === activeRoom.id);
    if (firstScene && !scenes.some((scene) => scene.id === selectedSceneId && scene.roomId === activeRoom.id)) {
      setSelectedSceneId(firstScene.id);
    }
  }, [activeRoom?.id, scenes, selectedSceneId]);

  useEffect(() => {
    if (!supabase || authState !== 'allowed' || !activeRoomIdIsUuid) return;
    void loadActiveRoomContent(activeRoom.id);
  }, [activeRoom?.id, activeRoomIdIsUuid, authState]);

  useEffect(() => {
    if (!supabase || authState !== 'allowed' || !activeRoomIdIsUuid) return;

    const realtimeClient = supabase;
    let refreshTimer: number | undefined;
    const refreshMessages = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadActiveRoomContent(activeRoom.id);
      }, 150);
    };

    const channel = realtimeClient
      .channel(`room-messages:${activeRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rp_messages',
          filter: `room_id=eq.${activeRoom.id}`,
        },
        refreshMessages,
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void realtimeClient.removeChannel(channel);
    };
  }, [activeRoom?.id, activeRoomIdIsUuid, authState]);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToast({ message, type, id });
    window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 3000);
  }

  async function handleAuthenticatedUser(user: User | null) {
    if (!user) {
      setAuthState('signed-out');
      setCurrentUserId(null);
      setCurrentAccessRole(null);
      setDiscordProfile(null);
      return;
    }

    const discordUserId = getDiscordUserId(user);
    setDiscordProfile(getDiscordProfile(user));
    const profileKey = getProfileKey(user, discordUserId);
    if (!profileKey) {
      setAuthMessage('Discordアカウントを確認できませんでした。Discordでログインしてください。');
      setAuthState('blocked');
      return;
    }

    setCurrentUserId(user.id);
    const allowedMember = await checkAllowed(discordUserId);
    setCurrentAccessRole(allowedMember?.role ?? null);
    const dp = getDiscordProfile(user);
    const discordDisplayName = dp?.displayName ?? null;
    const discordAvatarUrl = dp?.avatarUrl ?? null;
    if (allowedMember) await ensureMemberBootstrap(user.id, profileKey, allowedMember, discordDisplayName, discordAvatarUrl);
    if (allowedMember) await loadRoomData(user.id, profileKey, allowedMember, discordDisplayName, discordAvatarUrl);
    setAuthState(allowedMember ? 'allowed' : 'blocked');
  }

  async function checkAllowed(discordUserId?: string | null) {
    if (!supabase) return null;

    if (!discordUserId) return null;
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
    if (!data) return null;
    return {
      discordUserId: data.discord_user_id,
      display_name: data.display_name,
      role: data.role,
    } as AllowedMember;
  }

  async function ensureMemberBootstrap(userId: string, profileKey: string, allowedMember: AllowedMember, discordDisplayName: string | null, discordAvatarUrl: string | null) {
    if (!supabase) return;

    await supabase.from('profiles').upsert({
      id: userId,
      email: profileKey,
      display_name: discordDisplayName ?? allowedMember.display_name,
      avatar_url: discordAvatarUrl,
      updated_at: new Date().toISOString(),
    });
  }

  async function loadRoomData(userId: string, profileKey: string, allowedMember: AllowedMember, discordDisplayName: string | null, discordAvatarUrl: string | null) {
    if (!supabase) return;

    await supabase.from('profiles').upsert({
      id: userId,
      email: profileKey,
      display_name: discordDisplayName ?? allowedMember.display_name,
      avatar_url: discordAvatarUrl,
      updated_at: new Date().toISOString(),
    });

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, title, summary, tags, created_by')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (roomsError) {
      setAuthMessage(roomsError.message);
      return;
    }

    const firstRoom = rooms?.[0];
    if (!firstRoom) {
      setRooms([]);
      setScenes([]);
      setCharacters([]);
      setMessages([]);
      setRoomMembers([]);
      setRoomScenePermissions([]);
      setSceneEditPermissions([]);
      setSelectedRoomId(null);
      setSelectedSceneId('');
      setSelectedCharacterId('');
      setRoomDraft(emptyRoom);
      setSceneDraft(emptyScene);
      setCharacterDraft(createDefaultCharacter(userId));
      setCurrentView('rooms');
      setAuthMessage('アクセス可能なルームはまだありません。新規ルームを作成してください。');
      return;
    }

    setSelectedRoomId(firstRoom.id);
    const mappedRooms = rooms.map(rowToRoom);
    setRooms(mappedRooms);
    setRoomDraft(mappedRooms[0]);

    const roomIds = mappedRooms.map((room) => room.id);
    const [
      { data: remoteScenes },
      remoteCharacters,
      { data: remoteMessages },
      { data: remoteRoomMembers },
      { data: remoteRoomScenePermissions },
      { data: remoteSceneEditPermissions },
    ] = await Promise.all([
      supabase
        .from('scenes')
        .select('id, room_id, created_by, title, status, summary, location_name, time_label, map_x, map_y, tags, created_at')
        .in('room_id', roomIds)
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
      supabase
        .from('room_members')
        .select('room_id, user_id, role, profiles(display_name, email)')
        .in('room_id', roomIds),
      supabase
        .from('room_scene_permissions')
        .select('room_id, user_id, can_create_scenes, can_delete_scenes')
        .in('room_id', roomIds),
      supabase
        .from('scene_edit_permissions')
        .select('scene_id, user_id'),
    ]);

    const mappedScenes = remoteScenes?.map(rowToScene) ?? [];
    setScenes(mappedScenes);
    setSelectedSceneId(mappedScenes[0]?.id ?? '');
    setSceneDraft(mappedScenes[0] ?? createDefaultScene(firstRoom.id, userId));

    const mappedCharacters = remoteCharacters?.map(rowToCharacter) ?? [];
    setCharacters(mappedCharacters);
    setSelectedCharacterId(mappedCharacters[0]?.id ?? '');
    setCharacterDraft(mappedCharacters[0] ?? createDefaultCharacter(userId));

    setMessages(remoteMessages?.map(rowToMessage) ?? []);

    if (remoteRoomMembers) {
      setRoomMembers(remoteRoomMembers.map(rowToRoomMember));
    }

    if (remoteRoomScenePermissions) {
      setRoomScenePermissions(remoteRoomScenePermissions.map(rowToRoomScenePermission));
    }

    if (remoteSceneEditPermissions) {
      setSceneEditPermissions(remoteSceneEditPermissions.map(rowToSceneEditPermission));
    }
  }

  async function loadActiveRoomContent(roomId: string) {
    if (!supabase) return;

    const [remoteCharacters, { data: remoteMessages }] = await Promise.all([
      fetchCharactersApi(roomId).catch((error) => {
        setAuthMessage(error instanceof Error ? error.message : '探索者一覧を取得できませんでした。');
        return [] as CharacterRow[];
      }),
      supabase
        .from('rp_messages')
        .select('id, character_id, author_id, mode, body, created_at, profiles(display_name), characters(name)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    if (remoteCharacters.length) {
      const mappedCharacters = remoteCharacters.map(rowToCharacter);
      setCharacters(mappedCharacters);
      setSelectedCharacterId(mappedCharacters[0].id);
      setCharacterDraft(mappedCharacters[0]);
    } else {
      setCharacters([]);
      setSelectedCharacterId('');
      setCharacterDraft(createDefaultCharacter(currentUserId));
    }

    setMessages(remoteMessages?.map(rowToMessage) ?? []);
  }

  async function handleDiscordSignIn() {
    if (!supabase) return;

    setAuthMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: authRedirectUrl || window.location.origin,
        scopes: 'identify',
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

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid) {
      try {
        const row = await createMessageApi({
          roomId: selectedRoomId,
          sceneId: isUuid(selectedSceneId) ? selectedSceneId : null,
          characterId: messageMode === 'ic' && characters.some((c) => c.id === activeCharacter.id) ? activeCharacter.id : null,
          mode: messageMode,
          body: trimmed,
        });
        setMessages((current) => [...current, rowToMessage(row)]);
        setDraft('');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '発言を送信できませんでした。', 'error');
        return;
      }
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

    if (supabase && authState === 'allowed' && isUuid(message.id)) {
      try {
        const saved = rowToMessage(await updateMessageApi(message.id, trimmed));
        setMessages((current) =>
          current.map((currentMessage) => (currentMessage.id === saved.id ? saved : currentMessage)),
        );
        cancelEditMessage();
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '発言を保存できませんでした。', 'error');
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

    if (supabase && authState === 'allowed' && isUuid(message.id)) {
      try {
        await deleteMessageApi(message.id);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '発言を削除できませんでした。', 'error');
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

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid && currentUserId) {
      try {
        const data = await createCharacterApi(selectedRoomId, nextCharacter);
        const created = rowToCharacter(data);
        setCharacters((current) => [...current, created]);
        setSelectedCharacterId(created.id);
        showToast('探索者を作成しました。');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '探索者を作成できませんでした。', 'error');
        return;
      }
    }

    setCharacters((current) => [...current, nextCharacter]);
    setSelectedCharacterId(nextCharacter.id);
  }

  async function handleSaveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCharacter = normalizeCharacter(characterDraft);

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid && isUuid(nextCharacter.id)) {
      try {
        const data = await updateCharacterApi(selectedRoomId, nextCharacter);
        const saved = rowToCharacter(data);
        setCharacters((current) => current.map((character) => (character.id === saved.id ? saved : character)));
        setCharacterDraft(saved);
        showToast('探索者を保存しました。');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : '探索者を保存できませんでした。', 'error');
        return;
      }
    }

    setCharacters((current) =>
      current.map((character) => (character.id === nextCharacter.id ? nextCharacter : character)),
    );
    setCharacterDraft(nextCharacter);
  }

  async function handleArchiveCharacter() {
    if (!activeCharacter) return;

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid && isUuid(activeCharacter.id)) {
      try {
        await archiveCharacterApi(selectedRoomId, activeCharacter.id);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '探索者をアーカイブできませんでした。', 'error');
        return;
      }
    }

    setCharacters((current) => {
      const nextCharacters = current.filter((character) => character.id !== activeCharacter.id);
      setSelectedCharacterId(nextCharacters[0]?.id ?? demoCharacters[0].id);
      return nextCharacters.length ? nextCharacters : [createDefaultCharacter(currentUserId)];
    });
  }

  async function handleCreateRoom() {
    const nextRoom: Room = {
      id: crypto.randomUUID(),
      title: '新規ルーム',
      summary: '',
      tags: [],
      createdBy: activeActorId,
    };

    if (supabase && authState === 'allowed') {
      try {
        const created = rowToRoom(await createRoomApi(nextRoom));
        setRooms((current) => [...current, created]);
        setSelectedRoomId(created.id);
        setRoomDraft(created);
        setIsRoomConfigOpen(true);
        setRoomSettingsTab('basic');
        showToast('ルームを作成しました。');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'ルームを作成できませんでした。', 'error');
        return;
      }
    }

    setRooms((current) => [...current, nextRoom]);
    setSelectedRoomId(nextRoom.id);
    setRoomDraft(nextRoom);
    setIsRoomConfigOpen(true);
    setRoomSettingsTab('basic');
  }

  async function handleSaveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRoom = {
      ...roomDraft,
      title: roomDraft.title.trim() || '無題のルーム',
      summary: roomDraft.summary.trim(),
      tags: normalizeTags(roomDraft.tags),
    };

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid && isUuid(nextRoom.id) && canEditActiveRoom) {
      try {
        const saved = rowToRoom(await updateRoomApi(nextRoom));
        setRooms((current) => current.map((room) => (room.id === saved.id ? saved : room)));
        setRoomDraft(saved);
        showToast('ルームを保存しました。');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'ルームを保存できませんでした。', 'error');
        return;
      }
    }

    setRooms((current) => current.map((room) => (room.id === nextRoom.id ? nextRoom : room)));
    setRoomDraft(nextRoom);
  }

  function openRoomScenes(room: Room) {
    const firstRoomScene = scenes.find((scene) => scene.roomId === room.id);
    setSelectedRoomId(room.id);
    setRoomDraft(room);
    if (firstRoomScene) {
      setSelectedSceneId(firstRoomScene.id);
      setSceneDraft(firstRoomScene);
    }
    setConfiguredSceneId(null);
    setIsRoomConfigOpen(false);
    setCurrentView('room-scenes');
  }

  function toggleRoomAccordion(room: Room) {
    setSelectedRoomId(room.id);
    setRoomDraft(room);
    setExpandedRoomIds((current) => {
      const next = new Set(current);
      if (next.has(room.id)) next.delete(room.id);
      else next.add(room.id);
      return next;
    });
  }

  function openScene(scene: Scene) {
    const parentRoom = rooms.find((room) => room.id === scene.roomId);
    if (parentRoom) {
      setSelectedRoomId(parentRoom.id);
      setRoomDraft(parentRoom);
    }
    setSelectedSceneId(scene.id);
    setSceneDraft(scene);
    setConfiguredSceneId(null);
    setCurrentView('room');
  }

  function openSceneSettings(room: Room, scene: Scene) {
    setSelectedRoomId(room.id);
    setRoomDraft(room);
    setSelectedSceneId(scene.id);
    setSceneDraft(scene);
    setConfiguredSceneId(scene.id);
    setSceneSettingsTab('basic');
    setCurrentView('room-scenes');
  }

  async function handleCreateScene() {
    if (!canCreateActiveRoomScene) {
      showToast('このルームでシーンを作成する権限がありません。', 'error');
      return;
    }

    const targetRoomId = activeRoom.id;
    const nextScene = createDefaultScene(targetRoomId, activeActorId);

    if (supabase && authState === 'allowed' && isUuid(targetRoomId)) {
      try {
        const created = rowToScene(await createSceneApi(nextScene));
        setScenes((current) => [...current, created]);
        setSelectedSceneId(created.id);
        setSceneDraft(created);
        setConfiguredSceneId(created.id);
        setSceneSettingsTab('basic');
        setIsRoomConfigOpen(false);
        setCurrentView('room-scenes');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'シーンを作成できませんでした。', 'error');
        return;
      }
    }

    setScenes((current) => [...current, nextScene]);
    setSelectedSceneId(nextScene.id);
    setSceneDraft(nextScene);
    setConfiguredSceneId(nextScene.id);
    setSceneSettingsTab('basic');
    setIsRoomConfigOpen(false);
    setCurrentView('room-scenes');
  }

  async function handleSaveScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditSceneDraft) return;
    const nextScene = normalizeScene(sceneDraft);

    if (supabase && authState === 'allowed' && selectedRoomIdIsUuid && isUuid(nextScene.id)) {
      try {
        const saved = rowToScene(await updateSceneApi(nextScene));
        setScenes((current) => current.map((scene) => (scene.id === saved.id ? saved : scene)));
        setSceneDraft(saved);
        showToast('シーンを保存しました。');
        return;
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'シーンを保存できませんでした。', 'error');
        return;
      }
    }

    setScenes((current) => current.map((scene) => (scene.id === nextScene.id ? nextScene : scene)));
    setSceneDraft(nextScene);
  }

  async function handleDeleteRoom(room: Room) {
    if (!canDeleteRoom(room)) return;
    if (!window.confirm(`ルーム「${room.title}」を削除しますか？この操作は取り消せません。`)) return;

    if (supabase && authState === 'allowed' && isUuid(room.id)) {
      try {
        await deleteRoomApi(room.id);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'ルームを削除できませんでした。', 'error');
        return;
      }
    }

    setRooms((current) => {
      const nextRooms = current.filter((r) => r.id !== room.id);
      const nextRoom = nextRooms[0];
      if (nextRoom) {
        setSelectedRoomId(nextRoom.id);
        setRoomDraft(nextRoom);
      } else {
        setSelectedRoomId(null);
        setRoomDraft(emptyRoom);
      }
      return nextRooms;
    });
    setIsRoomConfigOpen(false);
    setCurrentView('rooms');
  }

  async function handleDeleteScene(scene: Scene) {
    if (!canDeleteScene(scene)) return;

    if (supabase && authState === 'allowed' && isUuid(scene.id)) {
      try {
        await deleteSceneApi(scene.id);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'シーンを削除できませんでした。', 'error');
        return;
      }
    }

    setScenes((current) => {
      const nextScenes = current.filter((currentScene) => currentScene.id !== scene.id);
      const nextRoomScene = nextScenes.find((currentScene) => currentScene.roomId === activeRoom.id);
      if (nextRoomScene) {
        setSelectedSceneId(nextRoomScene.id);
        setSceneDraft(nextRoomScene);
      }
      return nextScenes;
    });
    setConfiguredSceneId(null);
  }

  async function handleSaveRoomScenePermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoomPermissionUserId || !canManageRoomScenePermissions) return;

    const nextPermission: RoomScenePermission = {
      roomId: activeRoom.id,
      userId: selectedRoomPermissionUserId,
      canCreateScenes: roomPermissionDraft.canCreateScenes,
      canDeleteScenes: roomPermissionDraft.canDeleteScenes,
    };

    if (supabase && authState === 'allowed' && currentUserId && activeRoomIdIsUuid) {
      const { error } = await supabase.from('room_scene_permissions').upsert({
        room_id: activeRoom.id,
        user_id: selectedRoomPermissionUserId,
        granted_by: currentUserId,
        can_create_scenes: nextPermission.canCreateScenes,
        can_delete_scenes: nextPermission.canDeleteScenes,
      });
      if (error) {
        showToast(error.message, 'error');
        return;
      }
    }

    setRoomScenePermissions((current) => [
      ...current.filter(
        (permission) => !(permission.roomId === nextPermission.roomId && permission.userId === nextPermission.userId),
      ),
      nextPermission,
    ]);
    showToast('シーン権限を保存しました。');
  }

  async function handleGrantSceneEditor() {
    if (!selectedSceneEditorUserId || !canGrantSceneDraftEditors) return;
    const nextPermission = { sceneId: sceneDraft.id, userId: selectedSceneEditorUserId };

    if (supabase && authState === 'allowed' && currentUserId) {
      const { error } = await supabase.from('scene_edit_permissions').upsert({
        scene_id: sceneDraft.id,
        user_id: selectedSceneEditorUserId,
        granted_by: currentUserId,
      });
      if (error) {
        showToast(error.message, 'error');
        return;
      }
    }

    setSceneEditPermissions((current) =>
      current.some(
        (permission) => permission.sceneId === nextPermission.sceneId && permission.userId === nextPermission.userId,
      )
        ? current
        : [...current, nextPermission],
    );
    showToast('シーン編集者を追加しました。');
  }

  async function handleAllowDiscordAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || authState !== 'allowed' || currentAccessRole !== 'owner') return;

    const discordUserId = allowedDiscordDraft.discordUserId.trim();
    if (!/^[0-9]{17,20}$/.test(discordUserId)) {
      showToast('DiscordユーザIDは17-20桁の数字で入力してください。', 'error');
      return;
    }

    const { error } = await supabase.from('allowed_discord_accounts').upsert({
      discord_user_id: discordUserId,
      display_name: '(pending)',
      role: allowedDiscordDraft.role,
      is_active: true,
    });

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    setAllowedDiscordDraft({ discordUserId: '', role: 'player' });
    setAllowedAccounts((current) => {
      const exists = current.some((a) => a.discordUserId === discordUserId);
      if (exists) return current.map((a) => a.discordUserId === discordUserId ? { ...a, role: allowedDiscordDraft.role, isActive: true } : a);
      return [...current, { discordUserId, displayName: '(pending)', avatarUrl: null, role: allowedDiscordDraft.role, isActive: true }];
    });
    showToast('Discordアカウントを許可リストに追加しました。');
  }

  async function loadAllowedAccounts() {
    if (!supabase || currentAccessRole !== 'owner') return;
    const [{ data: accounts, error }, { data: profiles }] = await Promise.all([
      supabase.from('allowed_discord_accounts').select('discord_user_id, display_name, role, is_active').order('created_at', { ascending: true }),
      supabase.from('profiles').select('discord_user_id, display_name, avatar_url').not('discord_user_id', 'is', null),
    ]);
    if (error) { showToast(error.message, 'error'); return; }
    const profileMap = new Map((profiles ?? []).map((p) => [p.discord_user_id, p]));
    setAllowedAccounts((accounts ?? []).map((row) => {
      const profile = profileMap.get(row.discord_user_id);
      return {
        discordUserId: row.discord_user_id,
        displayName: profile?.display_name ?? row.display_name,
        avatarUrl: profile?.avatar_url ?? null,
        role: row.role as AccessRole,
        isActive: row.is_active,
      };
    }));
  }

  function selectAdminAccount(account: AllowedAccount) {
    setSelectedAdminAccountId(account.discordUserId);
    setAdminDetailDraft({ role: account.role, isActive: account.isActive });
  }

  async function saveAdminAccount() {
    if (!supabase || !selectedAdminAccountId || !adminDetailDraft) return;
    const { error } = await supabase
      .from('allowed_discord_accounts')
      .update({ role: adminDetailDraft.role, is_active: adminDetailDraft.isActive })
      .eq('discord_user_id', selectedAdminAccountId);
    if (error) { showToast(error.message, 'error'); return; }
    setAllowedAccounts((current) =>
      current.map((a) => a.discordUserId === selectedAdminAccountId ? { ...a, ...adminDetailDraft } : a),
    );
    showToast('ユーザ設定を保存しました。');
  }

  async function deleteAdminAccount(discordUserId: string) {
    if (!supabase) return;
    if (!window.confirm('このユーザを許可リストから削除しますか？')) return;
    const { error } = await supabase.from('allowed_discord_accounts').delete().eq('discord_user_id', discordUserId);
    if (error) { showToast(error.message, 'error'); return; }
    setAllowedAccounts((current) => current.filter((a) => a.discordUserId !== discordUserId));
    if (selectedAdminAccountId === discordUserId) {
      setSelectedAdminAccountId(null);
      setAdminDetailDraft(null);
    }
    showToast('ユーザを削除しました。');
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
            Discordでログインし、許可リストに登録されたDiscordアカウントだけがルームへ入れます。
          </p>
          <div className="auth-form">
            <button className="button-primary discord-button" type="button" onClick={handleDiscordSignIn}>
              <MessageCircle size={17} />
              Discordでログイン
            </button>
          </div>
          {authState === 'blocked' && <p className="error">このDiscordアカウントは許可リストにありません。</p>}
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
              className={currentView === 'rooms' || currentView === 'room-scenes' ? 'topbar-tab active' : 'topbar-tab'}
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
            {currentAccessRole === 'owner' && (
              <button
                className={currentView === 'admin' ? 'topbar-tab active' : 'topbar-tab'}
                type="button"
                onClick={() => { setCurrentView('admin'); void loadAllowedAccounts(); }}
              >
                <ShieldCheck size={16} />
                管理
              </button>
            )}
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
            <button className="button-primary" type="button" onClick={handleCreateRoom}>
              <Plus size={16} />
              新規ルーム
            </button>
          </div>
          <div className="room-list-grid">
            <section className="tool-panel" aria-label="ルーム一覧">
              <div className="section-title">
                <MessageSquareText size={16} />
                ルーム一覧
              </div>
              <div className="room-card-list">
                {rooms.length === 0 ? (
                  <p className="empty-state">ルームはまだありません。右上の新規ルームから作成してください。</p>
                ) : rooms.map((room) => {
                  const roomListScenes = scenes.filter((scene) => scene.roomId === room.id);
                  const isExpanded = expandedRoomIds.has(room.id);
                  return (
                    <article
                      className={room.id === activeRoom.id ? 'room-card selected' : 'room-card'}
                      key={room.id}
                    >
                      <div className="room-card-main">
                        <button
                          className={isExpanded ? 'mini-icon-button accordion-toggle open' : 'mini-icon-button accordion-toggle'}
                          type="button"
                          onClick={() => toggleRoomAccordion(room)}
                          aria-expanded={isExpanded}
                          aria-label={`${room.title}のシーン一覧`}
                        >
                          <ChevronDown size={16} />
                        </button>
                        <div>
                          <span>{room.title}</span>
                          <small>{room.tags.join(', ') || 'no tags'}</small>
                        </div>
                      </div>
                      <div className="inline-actions">
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => openRoomScenes(room)}
                        >
                          入室
                        </button>
                        <button
                          className="mini-icon-button"
                          type="button"
                          onClick={() => {
                            setSelectedRoomId(room.id);
                            setRoomDraft(room);
                            setRoomSettingsTab('basic');
                            setIsRoomConfigOpen(true);
                          }}
                          aria-label="ルーム設定"
                        >
                          <Settings size={15} />
                        </button>
                        {canDeleteRoom(room) && (
                          <button
                            className="mini-icon-button danger"
                            type="button"
                            onClick={() => void handleDeleteRoom(room)}
                            aria-label="ルームを削除"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="room-accordion" aria-label={`${room.title}のシーン`}>
                          {roomListScenes.length ? (
                            roomListScenes.map((scene) => (
                              <div className="room-accordion-item" key={scene.id}>
                                <div>
                                  <span>{scene.title}</span>
                                  <small>{scene.locationName || '場所未設定'} / {scene.timeLabel || '時間未設定'}</small>
                                </div>
                                <div className="inline-actions">
                                  <button className="button-secondary" type="button" onClick={() => openScene(scene)}>
                                    入室
                                  </button>
                                  {canEditScene(scene) && (
                                    <button
                                      className="mini-icon-button"
                                      type="button"
                                      onClick={() => openSceneSettings(room, scene)}
                                      aria-label="シーン設定"
                                    >
                                      <Settings size={15} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="muted">シーンはまだありません。</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
          {isRoomConfigOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="modal-panel" role="dialog" aria-modal="true" aria-label="ルーム設定">
                <div className="modal-header">
                  <div>
                    <p>Room Settings</p>
                    <h2>{roomDraft.title}</h2>
                  </div>
                  <button className="mini-icon-button" type="button" onClick={() => setIsRoomConfigOpen(false)} aria-label="閉じる">
                    <X size={15} />
                  </button>
                </div>
                <div className="segmented segmented-wide modal-tabs" aria-label="ルーム設定タブ">
                  <button className={roomSettingsTab === 'basic' ? 'active' : ''} type="button" onClick={() => setRoomSettingsTab('basic')}>
                    基本
                  </button>
                  <button
                    className={roomSettingsTab === 'permissions' ? 'active' : ''}
                    type="button"
                    onClick={() => setRoomSettingsTab('permissions')}
                  >
                    権限
                  </button>
                </div>
                {roomSettingsTab === 'basic' ? (
                  <form className="modal-body" onSubmit={handleSaveRoom}>
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
                    <div className="editor-actions compact">
                      <button className="button-primary" type="submit" disabled={!canEditActiveRoom}>
                        <Save size={16} />
                        保存
                      </button>
                      {canDeleteRoom(roomDraft) && (
                        <button
                          className="button-danger"
                          type="button"
                          onClick={() => void handleDeleteRoom(roomDraft)}
                        >
                          <Trash2 size={16} />
                          ルームを削除
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <form className="modal-body" onSubmit={handleSaveRoomScenePermission}>
                    <div className="field-grid three">
                      <label>
                        対象ユーザ
                        <select
                          value={selectedRoomPermissionUserId}
                          onChange={(event) => setSelectedRoomPermissionUserId(event.target.value)}
                          disabled={!canManageRoomScenePermissions}
                        >
                          {activeRoomMembers.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {formatRoomMemberLabel(member)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={roomPermissionDraft.canCreateScenes}
                          onChange={(event) =>
                            setRoomPermissionDraft({ ...roomPermissionDraft, canCreateScenes: event.target.checked })
                          }
                          disabled={!canManageRoomScenePermissions}
                        />
                        シーン作成
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={roomPermissionDraft.canDeleteScenes}
                          onChange={(event) =>
                            setRoomPermissionDraft({ ...roomPermissionDraft, canDeleteScenes: event.target.checked })
                          }
                          disabled={!canManageRoomScenePermissions}
                        />
                        シーン削除
                      </label>
                    </div>
                    <div className="editor-actions compact">
                      <button
                        className="button-primary"
                        type="submit"
                        disabled={!selectedRoomPermissionUserId || !canManageRoomScenePermissions}
                      >
                        <Save size={16} />
                        保存
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}
        </section>
      ) : currentView === 'room-scenes' ? (
        <section className="management-page" aria-label="ルーム内容">
          <div className="my-page-header">
            <div>
              <p>Room Scenes</p>
              <h1>{activeRoom.title}</h1>
            </div>
            <div className="panel-actions">
              <button className="button-secondary" type="button" onClick={() => setCurrentView('rooms')}>
                <BookOpen size={16} />
                ルーム一覧
              </button>
              <button className="button-primary" type="button" onClick={() => setCurrentView('room')}>
                <MessageSquareText size={16} />
                選択中シーンへ
              </button>
            </div>
          </div>
          <div className="management-grid scene-management-grid">
              <section className="tool-panel">
                <div className="tool-panel-header">
                  <div>
                    <p>Room Scenes</p>
                    <h2>{activeRoom.title}</h2>
                  </div>
                  <div className="panel-actions">
                    {canManageRoomScenePermissions && (
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => {
                          setRoomDraft(activeRoom);
                          setRoomSettingsTab('permissions');
                          setIsRoomConfigOpen(true);
                        }}
                      >
                        <Settings size={16} />
                        シーン権限
                      </button>
                    )}
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={handleCreateScene}
                      disabled={!canCreateActiveRoomScene}
                    >
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
                      role="button"
                      tabIndex={0}
                      onClick={() => openScene(scene)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openScene(scene);
                        }
                      }}
                    >
                      <span>{scene.title}</span>
                      <small>{scene.locationName || '場所未設定'} / {scene.timeLabel || '時間未設定'}</small>
                      <div className="inline-actions">
                        {canEditScene(scene) && (
                          <button
                            className="mini-icon-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openSceneSettings(activeRoom, scene);
                            }}
                            aria-label="シーン設定"
                          >
                            <Settings size={15} />
                          </button>
                        )}
                        {canDeleteScene(scene) && (
                          <button
                            className="mini-icon-button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteScene(scene);
                            }}
                            aria-label="シーン削除"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
          </div>
          {isRoomConfigOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="modal-panel" role="dialog" aria-modal="true" aria-label="ルーム設定">
                <div className="modal-header">
                  <div>
                    <p>Room Settings</p>
                    <h2>{roomDraft.title}</h2>
                  </div>
                  <button className="mini-icon-button" type="button" onClick={() => setIsRoomConfigOpen(false)} aria-label="閉じる">
                    <X size={15} />
                  </button>
                </div>
                <div className="segmented segmented-wide modal-tabs" aria-label="ルーム設定タブ">
                  <button className={roomSettingsTab === 'basic' ? 'active' : ''} type="button" onClick={() => setRoomSettingsTab('basic')}>
                    基本
                  </button>
                  <button
                    className={roomSettingsTab === 'permissions' ? 'active' : ''}
                    type="button"
                    onClick={() => setRoomSettingsTab('permissions')}
                  >
                    権限
                  </button>
                </div>
                {roomSettingsTab === 'basic' ? (
                  <form className="modal-body" onSubmit={handleSaveRoom}>
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
                    <div className="editor-actions compact">
                      <button className="button-primary" type="submit" disabled={!canEditActiveRoom}>
                        <Save size={16} />
                        保存
                      </button>
                      {canDeleteRoom(roomDraft) && (
                        <button
                          className="button-danger"
                          type="button"
                          onClick={() => void handleDeleteRoom(roomDraft)}
                        >
                          <Trash2 size={16} />
                          ルームを削除
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <form className="modal-body" onSubmit={handleSaveRoomScenePermission}>
                    <div className="field-grid three">
                      <label>
                        対象ユーザ
                        <select
                          value={selectedRoomPermissionUserId}
                          onChange={(event) => setSelectedRoomPermissionUserId(event.target.value)}
                          disabled={!canManageRoomScenePermissions}
                        >
                          {activeRoomMembers.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {formatRoomMemberLabel(member)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={roomPermissionDraft.canCreateScenes}
                          onChange={(event) =>
                            setRoomPermissionDraft({ ...roomPermissionDraft, canCreateScenes: event.target.checked })
                          }
                          disabled={!canManageRoomScenePermissions}
                        />
                        シーン作成
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={roomPermissionDraft.canDeleteScenes}
                          onChange={(event) =>
                            setRoomPermissionDraft({ ...roomPermissionDraft, canDeleteScenes: event.target.checked })
                          }
                          disabled={!canManageRoomScenePermissions}
                        />
                        シーン削除
                      </label>
                    </div>
                    <div className="editor-actions compact">
                      <button
                        className="button-primary"
                        type="submit"
                        disabled={!selectedRoomPermissionUserId || !canManageRoomScenePermissions}
                      >
                        <Save size={16} />
                        保存
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          )}
          {configuredSceneId === sceneDraft.id && canEditSceneDraft && (
            <div className="modal-backdrop" role="presentation">
              <section className="modal-panel" role="dialog" aria-modal="true" aria-label="シーン設定">
                <div className="modal-header">
                  <div>
                    <p>Scene Settings</p>
                    <h2>{sceneDraft.title}</h2>
                  </div>
                  <button className="mini-icon-button" type="button" onClick={() => setConfiguredSceneId(null)} aria-label="閉じる">
                    <X size={15} />
                  </button>
                </div>
                <div className="segmented segmented-wide modal-tabs" aria-label="シーン設定タブ">
                  <button className={sceneSettingsTab === 'basic' ? 'active' : ''} type="button" onClick={() => setSceneSettingsTab('basic')}>
                    基本
                  </button>
                  <button
                    className={sceneSettingsTab === 'permissions' ? 'active' : ''}
                    type="button"
                    onClick={() => setSceneSettingsTab('permissions')}
                  >
                    権限
                  </button>
                </div>
                {sceneSettingsTab === 'basic' ? (
                  <form className="modal-body" onSubmit={handleSaveScene}>
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
                        />
                      </label>
                      <label>
                        時間
                        <input
                          value={sceneDraft.timeLabel}
                          onChange={(event) => setSceneDraft({ ...sceneDraft, timeLabel: event.target.value })}
                          disabled={!canEditSceneDraft}
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
                    <div className="editor-actions compact">
                      <button className="button-primary" type="submit" disabled={!canEditSceneDraft}>
                        <Save size={16} />
                        保存
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="modal-body permission-modal-body">
                    <div className="field-grid permission-grid">
                      <label>
                        編集を許可するDiscordアカウント
                        <select
                          value={selectedSceneEditorUserId}
                          onChange={(event) => setSelectedSceneEditorUserId(event.target.value)}
                          disabled={!canGrantSceneDraftEditors}
                        >
                          {activeRoomMembers.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {formatRoomMemberLabel(member)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button-secondary permission-button"
                        type="button"
                        onClick={handleGrantSceneEditor}
                        disabled={!selectedSceneEditorUserId || !canGrantSceneDraftEditors}
                      >
                        <UsersRound size={16} />
                        編集許可
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      ) : currentView === 'admin' && currentAccessRole === 'owner' ? (
        <section className="management-page" aria-label="管理者ページ">
          <div className="my-page-header">
            <div>
              <p>Admin</p>
              <h1>ユーザ管理</h1>
            </div>
          </div>
          <div className="admin-layout">
            <section className="tool-panel" aria-label="ユーザ追加">
              <div className="section-title">
                <Plus size={16} />
                ユーザを追加
              </div>
              <form className="admin-add-form" onSubmit={handleAllowDiscordAccount}>
                <label>
                  DiscordユーザID
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{17,20}"
                    value={allowedDiscordDraft.discordUserId}
                    onChange={(event) => setAllowedDiscordDraft({ ...allowedDiscordDraft, discordUserId: event.target.value })}
                    placeholder="600301816315379723"
                  />
                </label>
                <label>
                  権限
                  <select
                    value={allowedDiscordDraft.role}
                    onChange={(event) => setAllowedDiscordDraft({ ...allowedDiscordDraft, role: event.target.value as AccessRole })}
                  >
                    <option value="player">player</option>
                    <option value="gm">gm</option>
                    <option value="viewer">viewer</option>
                    <option value="owner">owner</option>
                  </select>
                </label>
                <button className="button-primary" type="submit">
                  <Plus size={16} />
                  追加
                </button>
              </form>
            </section>
            <section className="tool-panel" aria-label="ユーザ一覧">
              <div className="section-title">
                <UsersRound size={16} />
                ユーザ一覧
              </div>
              {allowedAccounts.length === 0 ? (
                <p className="empty-state">ユーザがいません。</p>
              ) : (
                <div className="admin-user-list">
                  {allowedAccounts.map((account) => {
                    const isSelected = selectedAdminAccountId === account.discordUserId;
                    return (
                      <button
                        key={account.discordUserId}
                        type="button"
                        className={`admin-user-row${isSelected ? ' selected' : ''}${!account.isActive ? ' inactive' : ''}`}
                        onClick={() => selectAdminAccount(account)}
                      >
                        {account.avatarUrl ? (
                          <img className="admin-avatar" src={account.avatarUrl} alt="" />
                        ) : (
                          <span className="admin-avatar admin-avatar-fallback">
                            {account.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="admin-user-row-info">
                          <strong>{account.displayName}</strong>
                          {!account.isActive && <small>停止中</small>}
                        </span>
                        <span className="access-chip">{account.role}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {selectedAdminAccountId && adminDetailDraft && (() => {
              const account = allowedAccounts.find((a) => a.discordUserId === selectedAdminAccountId);
              if (!account) return null;
              return (
                <section className="tool-panel admin-detail-panel" aria-label="ユーザ詳細">
                  <div className="admin-detail-header">
                    {account.avatarUrl ? (
                      <img className="admin-avatar-large" src={account.avatarUrl} alt="" />
                    ) : (
                      <span className="admin-avatar-large admin-avatar-fallback">
                        {account.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <strong>{account.displayName}</strong>
                      <small>Discord ID: {account.discordUserId}</small>
                    </div>
                  </div>
                  <div className="field-grid two">
                    <label>
                      権限
                      <select
                        value={adminDetailDraft.role}
                        onChange={(e) => setAdminDetailDraft({ ...adminDetailDraft, role: e.target.value as AccessRole })}
                      >
                        <option value="player">player</option>
                        <option value="gm">gm</option>
                        <option value="viewer">viewer</option>
                        <option value="owner">owner</option>
                      </select>
                    </label>
                    <label>
                      ステータス
                      <select
                        value={adminDetailDraft.isActive ? 'active' : 'suspended'}
                        onChange={(e) => setAdminDetailDraft({ ...adminDetailDraft, isActive: e.target.value === 'active' })}
                      >
                        <option value="active">有効</option>
                        <option value="suspended">停止</option>
                      </select>
                    </label>
                  </div>
                  <div className="editor-actions compact">
                    <button className="button-primary" type="button" onClick={() => void saveAdminAccount()}>
                      <Save size={16} />
                      保存
                    </button>
                    <button className="button-danger" type="button" onClick={() => void deleteAdminAccount(account.discordUserId)}>
                      <Trash2 size={16} />
                      削除
                    </button>
                  </div>
                </section>
              );
            })()}
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
              {discordProfile && (
                <section className="discord-profile-card" aria-label="Discordプロフィール">
                  {discordProfile.avatarUrl ? (
                    <img src={discordProfile.avatarUrl} alt="" />
                  ) : (
                    <span className="discord-avatar-fallback">
                      <MessageCircle size={18} />
                    </span>
                  )}
                  <div>
                    <span>Discord</span>
                    <span className="access-chip">連携済み</span>
                    <strong>{discordProfile.displayName}</strong>
                    <small>{discordProfile.username}</small>
                    {discordProfile.id && <small>ID: {discordProfile.id}</small>}
                  </div>
                </section>
              )}
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
      ) : (
      <div className={isRoomNavOpen ? 'workspace' : 'workspace nav-collapsed'}>
        {!isRoomNavOpen && (
          <button
            className="room-nav-tab"
            type="button"
            onClick={() => setIsRoomNavOpen(true)}
            aria-label="ルームナビゲーションを開く"
          >
            <BookOpen size={16} />
            <span>ナビ</span>
          </button>
        )}
        {isRoomNavOpen && (
        <aside className="left-rail" aria-label="ルームナビゲーション">
          <div className="rail-toolbar">
            <span>ルームナビゲーション</span>
            <button
              className="mini-icon-button"
              type="button"
              onClick={() => setIsRoomNavOpen(false)}
              aria-label="ルームナビゲーションを閉じる"
            >
              <X size={15} />
            </button>
          </div>
          <section>
            <div className="section-title">
              <BookOpen size={16} />
              Recent Scenes
            </div>
            <button className="button-secondary rail-action" type="button" onClick={() => setCurrentView('room-scenes')}>
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
        )}

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
        </aside>
      </div>
      )}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.message}
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

function getDiscordProfile(user: User): DiscordProfile | null {
  const discordIdentity = user.identities?.find((identity) => identity.provider === 'discord');
  const identityData = discordIdentity?.identity_data;
  if (!discordIdentity || !identityData) return null;
  const id = getDiscordUserId(user);
  const username = String(identityData.preferred_username ?? identityData.user_name ?? identityData.name ?? 'Discord User');
  const displayName = String(identityData.full_name ?? identityData.name ?? identityData.global_name ?? username);
  const avatarUrl = identityData.avatar_url ? String(identityData.avatar_url) : null;
  return { id, username, displayName, avatarUrl };
}

function getProfileKey(user: User, discordUserId: string | null) {
  if (discordUserId) return `discord:${discordUserId}`;
  return null;
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

function rowToRoomMember(row: {
  room_id: string;
  user_id: string;
  role?: string | null;
  profiles?:
    | { display_name?: string | null; email?: string | null; discord_user_id?: string | null }
    | Array<{ display_name?: string | null; email?: string | null; discord_user_id?: string | null }>
    | null;
}): RoomMember {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const discordUserId = profile?.discord_user_id ?? parseDiscordUserIdFromProfileKey(profile?.email);
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: profile?.display_name ?? profile?.email ?? 'Unknown',
    discordUserId,
    role: isAccessRole(row.role) ? row.role : 'player',
  };
}

function parseDiscordUserIdFromProfileKey(profileKey?: string | null) {
  const match = profileKey?.match(/^discord:(\d{17,20})$/);
  return match?.[1] ?? null;
}

function formatRoomMemberLabel(member: RoomMember) {
  const discordLabel = member.discordUserId ? `Discord ${member.discordUserId}` : 'Discord未連携';
  return `${member.displayName} / ${discordLabel} / ${member.role}`;
}

function rowToRoomScenePermission(row: {
  room_id: string;
  user_id: string;
  can_create_scenes?: boolean | null;
  can_delete_scenes?: boolean | null;
}): RoomScenePermission {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    canCreateScenes: Boolean(row.can_create_scenes),
    canDeleteScenes: Boolean(row.can_delete_scenes),
  };
}

function rowToSceneEditPermission(row: { scene_id: string; user_id: string }): SceneEditPermission {
  return { sceneId: row.scene_id, userId: row.user_id };
}

function isAccessRole(role: string | null | undefined): role is AccessRole {
  return role === 'owner' || role === 'gm' || role === 'player' || role === 'viewer';
}

function rowToMessage(message: {
  id: string;
  character_id: string | null;
  author_id: string | null;
  mode: string;
  body: string;
  created_at: string;
  characters?: { name?: string | null } | Array<{ name?: string | null }> | null;
  profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
}): RpMessage {
  const characterRelation = Array.isArray(message.characters) ? message.characters[0] : message.characters;
  const profileRelation = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles;

  return {
    id: message.id,
    characterId: message.character_id,
    authorId: message.author_id,
    author: characterRelation?.name ?? profileRelation?.display_name ?? 'Unknown',
    mode: message.mode === 'ooc' ? 'ooc' : 'ic',
    body: message.body,
    createdAt: new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(message.created_at)),
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

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}
