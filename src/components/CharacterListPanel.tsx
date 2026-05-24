import { UsersRound } from 'lucide-react';
import type { Character } from '../types';

type CharacterListPanelProps = {
  characters: Character[];
  selectedCharacterId: string;
  showArchivedCharacters: boolean;
  onSelectCharacter: (characterId: string) => void;
  onToggleArchived: (showArchived: boolean) => void;
};

export function CharacterListPanel({
  characters,
  selectedCharacterId,
  showArchivedCharacters,
  onSelectCharacter,
  onToggleArchived,
}: CharacterListPanelProps) {
  const visibleCharacters = characters.filter((character) => showArchivedCharacters || !character.isArchived);

  return (
    <aside className="character-manager-list" aria-label="探索者一覧">
      <div className="character-list-header">
        <div className="section-title">
          <UsersRound size={16} />
          探索者一覧
        </div>
      </div>
      <label className="archive-filter-toggle">
        <input
          type="checkbox"
          checked={showArchivedCharacters}
          onChange={(event) => onToggleArchived(event.target.checked)}
        />
        アーカイブ済みを表示
      </label>
      <div className="character-list">
        {visibleCharacters.length === 0 ? (
          <p className="empty-state">探索者はまだありません。右上のプラスマークから作成してください。</p>
        ) : (
          visibleCharacters.map((character) => (
            <button
              className={`${character.id === selectedCharacterId ? 'character-item selected' : 'character-item'}${character.isArchived ? ' archived' : ''}`}
              key={character.id}
              type="button"
              onClick={() => onSelectCharacter(character.id)}
            >
              <span className="avatar" style={{ backgroundColor: character.color }} />
              <span>
                <strong>{character.name}</strong>
                <small>{character.isArchived ? 'アーカイブ済み' : (character.archetype || '探索者')}</small>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
