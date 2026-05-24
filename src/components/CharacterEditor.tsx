import { useEffect, useState } from 'react';
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react';
import { Archive, Image as ImageIcon, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import {
  cocSkillDefinitions,
  getSkillCategories,
  getSkillTotal,
  normalizeSkillEntry,
  resolveSkillBase,
} from '../cocSkills';
import {
  backgroundFields,
  characteristicKeys,
  clampSkillPoint,
  type DerivedCoCValues,
} from '../characterModel';
import type { Character, CoCSkillEntry } from '../types';

type CharacterEditorProps = {
  activeDerived: DerivedCoCValues;
  canArchiveCharacter?: boolean;
  canManageActiveCharacter: boolean;
  characterDraft: Character;
  currentUserId: string | null;
  onArchive: () => void;
  onImageUpload?: (file: File) => Promise<void>;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  setCharacterDraft: Dispatch<SetStateAction<Character>>;
};

const skillCategories = getSkillCategories();

export function CharacterEditor({
  activeDerived,
  canArchiveCharacter = true,
  canManageActiveCharacter,
  characterDraft,
  currentUserId,
  onArchive,
  onImageUpload,
  onSave,
  setCharacterDraft,
}: CharacterEditorProps) {
  const [isEditing, setIsEditing] = useState(!canArchiveCharacter);
  const [editingSnapshot, setEditingSnapshot] = useState<Character | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const occupationBudget = characterDraft.characteristics.edu * 20;
  const interestBudget = characterDraft.characteristics.int * 10;
  const occupationUsed = Object.values(characterDraft.skills).reduce((sum, skill) => sum + skill.occupation, 0);
  const interestUsed = Object.values(characterDraft.skills).reduce((sum, skill) => sum + skill.interest, 0);

  useEffect(() => {
    setIsEditing(!canArchiveCharacter);
    setEditingSnapshot(null);
  }, [characterDraft.id, canArchiveCharacter]);

  function startEditing() {
    setEditingSnapshot(characterDraft);
    setIsEditing(true);
  }

  function cancelEditing() {
    if (editingSnapshot) setCharacterDraft(editingSnapshot);
    setEditingSnapshot(null);
    setIsEditing(!canArchiveCharacter);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    await onSave(event);
    setEditingSnapshot(null);
    setIsEditing(false);
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImageUpload) return;
    setIsUploadingImage(true);
    try {
      await onImageUpload(file);
    } finally {
      setIsUploadingImage(false);
    }
  }

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

  function addCustomMemo() {
    setCharacterDraft((current) => ({
      ...current,
      background: {
        ...current.background,
        customMemos: [
          ...current.background.customMemos,
          { id: crypto.randomUUID(), title: 'メモ', body: '' },
        ],
      },
    }));
  }

  function updateCustomMemo(id: string, field: 'title' | 'body', value: string) {
    setCharacterDraft((current) => ({
      ...current,
      background: {
        ...current.background,
        customMemos: current.background.customMemos.map((memo) =>
          memo.id === id ? { ...memo, [field]: value } : memo,
        ),
      },
    }));
  }

  function deleteCustomMemo(id: string) {
    setCharacterDraft((current) => ({
      ...current,
      background: {
        ...current.background,
        customMemos: current.background.customMemos.filter((memo) => memo.id !== id),
      },
    }));
  }

  return (
    <form className="character-editor character-editor-page" onSubmit={handleSubmit}>
      <div className="editor-heading">
        <div>
          <p>Character Sheet</p>
          <h2>{characterDraft.name}</h2>
        </div>
        <div className="editor-heading-actions">
          <span className="access-chip">{characterDraft.ownerId === currentUserId ? 'MY PC' : 'ROOM PC'}</span>
          {!isEditing && canManageActiveCharacter && (
            <button className="button-secondary compact-button" type="button" onClick={startEditing}>
              <Pencil size={15} />
              編集
            </button>
          )}
        </div>
      </div>

      <section className="character-portrait-row" aria-label="探索者画像">
        <div className="character-portrait-frame">
          {characterDraft.imageUrl ? (
            <img src={characterDraft.imageUrl} alt={`${characterDraft.name}の画像`} />
          ) : (
            <ImageIcon size={28} />
          )}
        </div>
        <div className="character-portrait-meta">
          <span>Character Image</span>
          <strong>{characterDraft.imagePath ? '保存済み' : characterDraft.imageUrl ? 'プレビュー' : '未設定'}</strong>
          {isEditing && (
            <label className="button-secondary compact-button image-upload-button">
              <Upload size={15} />
              {isUploadingImage ? 'アップロード中' : '画像を選択'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} disabled={!onImageUpload || isUploadingImage} />
            </label>
          )}
        </div>
      </section>

      <div className="field-grid two">
        {isEditing ? (
          <>
            <EditableTextField label="名前" value={characterDraft.name} onChange={(value) => setCharacterDraft({ ...characterDraft, name: value })} />
            <EditableTextField label="プレイヤー" value={characterDraft.player} onChange={(value) => setCharacterDraft({ ...characterDraft, player: value })} />
            <EditableTextField
              label="職業"
              value={characterDraft.occupation}
              onChange={(value) =>
                setCharacterDraft({
                  ...characterDraft,
                  occupation: value,
                  archetype: value || characterDraft.archetype,
                })
              }
            />
            <EditableTextField label="年齢" value={characterDraft.age} onChange={(value) => setCharacterDraft({ ...characterDraft, age: value })} />
            <EditableTextField label="性別" value={characterDraft.gender} onChange={(value) => setCharacterDraft({ ...characterDraft, gender: value })} />
            <EditableTextField label="身長" value={characterDraft.height} onChange={(value) => setCharacterDraft({ ...characterDraft, height: value })} />
            <EditableTextField label="体重" value={characterDraft.weight} onChange={(value) => setCharacterDraft({ ...characterDraft, weight: value })} />
            <EditableTextField label="髪の色" value={characterDraft.hairColor} onChange={(value) => setCharacterDraft({ ...characterDraft, hairColor: value })} />
            <EditableTextField label="瞳の色" value={characterDraft.eyeColor} onChange={(value) => setCharacterDraft({ ...characterDraft, eyeColor: value })} />
            <EditableTextField label="肌の色" value={characterDraft.skinColor} onChange={(value) => setCharacterDraft({ ...characterDraft, skinColor: value })} />
            <EditableTextField label="色" value={characterDraft.color} onChange={(value) => setCharacterDraft({ ...characterDraft, color: value })} />
            <EditableTextField label="住所" value={characterDraft.residence} onChange={(value) => setCharacterDraft({ ...characterDraft, residence: value })} />
            <EditableTextField label="出身" value={characterDraft.birthplace} onChange={(value) => setCharacterDraft({ ...characterDraft, birthplace: value })} />
            <EditableTextField label="タグ" value={formatTags(characterDraft.tags)} onChange={(value) => setCharacterDraft({ ...characterDraft, tags: parseTags(value) })} />
          </>
        ) : (
          <>
            <ReadField label="名前" value={characterDraft.name} />
            <ReadField label="プレイヤー" value={characterDraft.player} />
            <ReadField label="職業" value={characterDraft.occupation} />
            <ReadField label="年齢" value={characterDraft.age} />
            <ReadField label="性別" value={characterDraft.gender} />
            <ReadField label="身長" value={characterDraft.height} />
            <ReadField label="体重" value={characterDraft.weight} />
            <ReadField label="髪の色" value={characterDraft.hairColor} />
            <ReadField label="瞳の色" value={characterDraft.eyeColor} />
            <ReadField label="肌の色" value={characterDraft.skinColor} />
            <ReadField label="色" value={characterDraft.color} />
            <ReadField label="住所" value={characterDraft.residence} />
            <ReadField label="出身" value={characterDraft.birthplace} />
            <ReadField label="タグ" value={formatTags(characterDraft.tags)} />
          </>
        )}
      </div>

      <section className="editor-section">
        <h3>Characteristics</h3>
        <div className="stat-grid">
          {characteristicKeys.map((key) => (
            isEditing ? (
              <EditableNumberField
                key={key}
                label={key.toUpperCase()}
                max={99}
                value={characterDraft.characteristics[key]}
                onChange={(value) =>
                  setCharacterDraft({
                    ...characterDraft,
                    characteristics: {
                      ...characterDraft.characteristics,
                      [key]: value,
                    },
                  })
                }
              />
            ) : (
              <ReadField key={key} label={key.toUpperCase()} value={characterDraft.characteristics[key]} />
            )
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
          {isEditing ? (
            <>
              <EditableNumberField label="SAN" value={characterDraft.sanityCurrent} onChange={(value) => setCharacterDraft({ ...characterDraft, sanityCurrent: value })} />
              <EditableNumberField label={`HP / ${activeDerived.hitPointsMax}`} value={characterDraft.hitPointsCurrent} onChange={(value) => setCharacterDraft({ ...characterDraft, hitPointsCurrent: value })} />
              <EditableNumberField label={`MP / ${activeDerived.magicPointsMax}`} value={characterDraft.magicPointsCurrent} onChange={(value) => setCharacterDraft({ ...characterDraft, magicPointsCurrent: value })} />
            </>
          ) : (
            <>
              <ReadField label="SAN" value={characterDraft.sanityCurrent} />
              <ReadField label={`HP / ${activeDerived.hitPointsMax}`} value={characterDraft.hitPointsCurrent} />
              <ReadField label={`MP / ${activeDerived.magicPointsMax}`} value={characterDraft.magicPointsCurrent} />
            </>
          )}
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
                      {(['occupation', 'interest', 'growth', 'other'] as const).map((field) =>
                        isEditing ? (
                          <input
                            key={field}
                            type="number"
                            min="0"
                            max="999"
                            value={normalizedEntry[field]}
                            onChange={(event) => updateSkill(definition.name, field, Number(event.target.value))}
                            aria-label={`${definition.name} ${field}`}
                          />
                        ) : (
                          <span key={field}>{normalizedEntry[field]}</span>
                        ),
                      )}
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
        {isEditing ? (
          <>
            <EditableTextarea label="武器" value={characterDraft.weapons} onChange={(value) => setCharacterDraft({ ...characterDraft, weapons: value })} />
            <EditableTextarea label="所持品" value={characterDraft.possessions} onChange={(value) => setCharacterDraft({ ...characterDraft, possessions: value })} />
          </>
        ) : (
          <>
            <ReadField label="武器" value={characterDraft.weapons} />
            <ReadField label="所持品" value={characterDraft.possessions} />
          </>
        )}
      </section>

      <section className="editor-section">
        <h3>Memo</h3>
        {backgroundFields.map((field) =>
          isEditing ? (
            <EditableTextarea
              key={field.key}
              label={field.label}
              value={characterDraft.background[field.key]}
              onChange={(value) =>
                setCharacterDraft({
                  ...characterDraft,
                  background: { ...characterDraft.background, [field.key]: value },
                })
              }
            />
          ) : (
            <ReadField key={field.key} label={field.label} value={characterDraft.background[field.key]} />
          ),
        )}
        {isEditing ? (
          <>
            <EditableTextarea label="メモ" value={characterDraft.memo} onChange={(value) => setCharacterDraft({ ...characterDraft, memo: value })} />
            <div className="custom-memo-list">
              {characterDraft.background.customMemos.map((memo) => (
                <section className="custom-memo-card" key={memo.id}>
                  <div className="custom-memo-header">
                    <EditableTextField label="メモ欄名" value={memo.title} onChange={(value) => updateCustomMemo(memo.id, 'title', value)} />
                    <button className="mini-icon-button danger" type="button" onClick={() => deleteCustomMemo(memo.id)} aria-label={`${memo.title}を削除`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <EditableTextarea label="内容" value={memo.body} onChange={(value) => updateCustomMemo(memo.id, 'body', value)} />
                </section>
              ))}
              <button className="button-secondary compact-button custom-memo-add" type="button" onClick={addCustomMemo}>
                <Plus size={15} />
                メモ欄を追加
              </button>
            </div>
          </>
        ) : (
          <>
            <ReadField label="メモ" value={characterDraft.memo} />
            {characterDraft.background.customMemos.map((memo) => (
              <ReadField key={memo.id} label={memo.title} value={memo.body} />
            ))}
          </>
        )}
      </section>

      <div className="editor-actions">
        {isEditing ? (
          <>
            <button className="button-primary" type="submit" disabled={!canManageActiveCharacter}>
              <Save size={16} />
              保存
            </button>
            <button className="button-secondary" type="button" onClick={cancelEditing}>
              <X size={16} />
              キャンセル
            </button>
          </>
        ) : (
          <button className="button-primary" type="button" onClick={startEditing} disabled={!canManageActiveCharacter}>
            <Pencil size={16} />
            編集
          </button>
        )}
        {canArchiveCharacter && (
          <button className="button-secondary" type="button" onClick={onArchive} disabled={!canManageActiveCharacter}>
            <Archive size={16} />
            アーカイブ
          </button>
        )}
      </div>
    </form>
  );
}

function ReadField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="read-field">
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === '' ? '未設定' : value}</strong>
    </div>
  );
}

function EditableTextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditableNumberField({
  label,
  max,
  value,
  onChange,
}: {
  label: string;
  max?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input type="number" min="0" max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function EditableTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function formatTags(tags: string[]) {
  return tags.join('、');
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,\n、]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20))];
}
