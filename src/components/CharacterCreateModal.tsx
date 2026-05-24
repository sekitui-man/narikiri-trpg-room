import type { ChangeEvent } from 'react';
import { FileText, Plus, X } from 'lucide-react';

type CharacterCreateModalProps = {
  onClose: () => void;
  onCreateBlank: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function CharacterCreateModal({ onClose, onCreateBlank, onImport }: CharacterCreateModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel character-create-modal" role="dialog" aria-modal="true" aria-labelledby="character-create-title">
        <div className="modal-header">
          <div>
            <p>Create Investigator</p>
            <h2 id="character-create-title">探索者を作成</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="character-create-grid">
          <button className="menu-card-button" type="button" onClick={onCreateBlank}>
            <span className="menu-card-icon">
              <Plus size={24} />
            </span>
            <span>
              <strong>0から作る</strong>
              <small>空の探索者シートを開きます</small>
            </span>
          </button>

          <label className="menu-card-button file-card-button">
            <span className="menu-card-icon">
              <FileText size={24} />
            </span>
            <span>
              <strong>いあキャラからインポート</strong>
              <small>テキスト出力を読み込みます</small>
            </span>
            <input type="file" accept=".txt,text/plain" onChange={onImport} />
          </label>
        </div>
      </section>
    </div>
  );
}
