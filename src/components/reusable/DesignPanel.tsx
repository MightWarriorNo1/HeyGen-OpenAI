import { X, Settings } from 'lucide-react';

interface DesignSettings {
  cameraButton: {
    opacity: number;
    color: string;
    size: number;
    position: {
      top: number;
      left: number;
    };
  };
  paperClipButton: {
    opacity: number;
    color: string;
    size: number;
    position: {
      top: number;
      left: number;
    };
  };
  buttonGap: number;
}

interface DesignPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DesignSettings;
  onSettingsChange: (settings: DesignSettings) => void;
}

export const DesignPanel = ({ isOpen, onClose, settings, onSettingsChange }: DesignPanelProps) => {
  const updateSettings = (updates: Partial<DesignSettings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const updateCameraButton = (updates: Partial<DesignSettings['cameraButton']>) => {
    updateSettings({
      cameraButton: { ...settings.cameraButton, ...updates }
    });
  };

  const updatePaperClipButton = (updates: Partial<DesignSettings['paperClipButton']>) => {
    updateSettings({
      paperClipButton: { ...settings.paperClipButton, ...updates }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 rounded-t-xl flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-xl font-bold">Design Panel - Mobile View</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Camera Button Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Camera Button
            </h3>

            {/* Opacity */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Opacity</label>
                <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                  {Math.round(settings.cameraButton.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.cameraButton.opacity}
                onChange={(e) => updateCameraButton({ opacity: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Color */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Color</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.cameraButton.color}
                  </span>
                  <input
                    type="color"
                    value={settings.cameraButton.color}
                    onChange={(e) => updateCameraButton({ color: e.target.value })}
                    className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Size (px)</label>
                <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                  {settings.cameraButton.size}px
                </span>
              </div>
              <input
                type="range"
                min="32"
                max="80"
                step="1"
                value={settings.cameraButton.size}
                onChange={(e) => updateCameraButton({ size: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Top (rem)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.cameraButton.position.top}rem
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={settings.cameraButton.position.top}
                  onChange={(e) => updateCameraButton({
                    position: { ...settings.cameraButton.position, top: parseFloat(e.target.value) }
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Left (rem)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.cameraButton.position.left}rem
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={settings.cameraButton.position.left}
                  onChange={(e) => updateCameraButton({
                    position: { ...settings.cameraButton.position, left: parseFloat(e.target.value) }
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Paper Clip Button Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Paper Clip Button
            </h3>

            {/* Opacity */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Opacity</label>
                <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                  {Math.round(settings.paperClipButton.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.paperClipButton.opacity}
                onChange={(e) => updatePaperClipButton({ opacity: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Color */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Color</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.paperClipButton.color}
                  </span>
                  <input
                    type="color"
                    value={settings.paperClipButton.color}
                    onChange={(e) => updatePaperClipButton({ color: e.target.value })}
                    className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Size */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Size (px)</label>
                <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                  {settings.paperClipButton.size}px
                </span>
              </div>
              <input
                type="range"
                min="32"
                max="80"
                step="1"
                value={settings.paperClipButton.size}
                onChange={(e) => updatePaperClipButton({ size: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Top (rem)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.paperClipButton.position.top}rem
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={settings.paperClipButton.position.top}
                  onChange={(e) => updatePaperClipButton({
                    position: { ...settings.paperClipButton.position, top: parseFloat(e.target.value) }
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Left (rem)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.paperClipButton.position.left}rem
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.5"
                  value={settings.paperClipButton.position.left}
                  onChange={(e) => updatePaperClipButton({
                    position: { ...settings.paperClipButton.position, left: parseFloat(e.target.value) }
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Button Gap */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Button Spacing</h3>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Gap (rem)</label>
                <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                  {settings.buttonGap}rem
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.25"
                value={settings.buttonGap}
                onChange={(e) => updateSettings({ buttonGap: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

