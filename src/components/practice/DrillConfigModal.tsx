import { useEffect, type FC } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import {
  DrillOptions,
  DrillTypePicker,
  KeyPicker,
  SettingsSection,
  ThinkTimePicker,
} from './DrillSettings';

export interface DrillConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart?: () => void;
}

/** In-drill settings. Same building blocks as the setup screen; changes apply immediately. */
export const DrillConfigModal: FC<DrillConfigModalProps> = ({ isOpen, onClose, onStart }) => {
  const startPractice = usePracticeStore((s) => s.startPractice);

  // Escape closes the dialog instead of exiting the drill
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRestart = () => {
    onClose();
    if (onStart) {
      onStart();
    } else {
      startPractice();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-settings-title"
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 id="drill-settings-title" className="text-lg font-bold text-white">
              Drill settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Changes apply from the next challenge.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        <SettingsSection title="Drill">
          <DrillTypePicker compact />
        </SettingsSection>

        <SettingsSection title="Key">
          <KeyPicker />
        </SettingsSection>

        <SettingsSection title="Time to find it">
          <ThinkTimePicker />
        </SettingsSection>

        <DrillOptions />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={handleRestart}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            ↺ Restart drill (resets score)
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-lg transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
