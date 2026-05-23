import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Archive, Save } from 'lucide-react';
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
  onSave: (event: FormEvent<HTMLFormElement>) => void;
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
  onSave,
  setCharacterDraft,
}: CharacterEditorProps) {
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
        <button
          className="button-secondary"
          type="button"
          onClick={onArchive}
          disabled={!canManageActiveCharacter || !canArchiveCharacter}
        >
          <Archive size={16} />
          アーカイブ
        </button>
      </div>
    </form>
  );
}
