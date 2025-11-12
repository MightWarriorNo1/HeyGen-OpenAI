import { X, Settings, Type, Palette, Layout, Move } from 'lucide-react';

export interface DesignSettings {
  // Button Settings
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
  
  // Text Colors
  textColors: {
    userMessage: string;
    assistantMessage: string;
    header: string;
    buttonText: string;
  };
  
  
  // Font Settings
  fonts: {
    family: string;
    size: number;
    weight: number;
    lineHeight: number;
  };
  
  // Layout Settings
  layout: {
    messagePadding: number;
    messageBorderRadius: number;
    messageMaxWidth: number;
    messageSpacing: number;
    avatarSize: number;
    headerPadding: number;
  };
  
  // Background Colors
  backgrounds: {
    page: string;
    header: string;
  };
  
  // Position Settings
  positions: {
    header: {
      top: number;
      left: number;
    };
  };
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

  const updateNested = <K extends keyof DesignSettings>(
    key: K,
    updates: Partial<DesignSettings[K]>
  ) => {
    const currentValue = settings[key];
    if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
      updateSettings({
        [key]: { ...currentValue, ...updates }
      } as Partial<DesignSettings>);
    }
  };

  if (!isOpen) return null;

  const fontFamilies = [
    'Arial, sans-serif',
    'Helvetica, sans-serif',
    'Times New Roman, serif',
    'Georgia, serif',
    'Verdana, sans-serif',
    'Courier New, monospace',
    'Lobster, cursive',
    'Bell MT, serif',
    'Roboto, sans-serif',
    'Open Sans, sans-serif',
    'Montserrat, sans-serif',
    'Poppins, sans-serif',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 rounded-t-xl flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-xl font-bold">Design Panel</h2>
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


          {/* Layout Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Layout className="w-5 h-5 text-orange-600" />
              Layout Settings
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Message Padding (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.messagePadding}px
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="32"
                  step="2"
                  value={settings.layout.messagePadding}
                  onChange={(e) => updateNested('layout', { messagePadding: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Border Radius (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.messageBorderRadius}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="2"
                  value={settings.layout.messageBorderRadius}
                  onChange={(e) => updateNested('layout', { messageBorderRadius: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Max Width (%)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.messageMaxWidth}%
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="100"
                  step="5"
                  value={settings.layout.messageMaxWidth}
                  onChange={(e) => updateNested('layout', { messageMaxWidth: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Message Spacing (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.messageSpacing}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="32"
                  step="2"
                  value={settings.layout.messageSpacing}
                  onChange={(e) => updateNested('layout', { messageSpacing: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Avatar Size (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.avatarSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="24"
                  max="64"
                  step="4"
                  value={settings.layout.avatarSize}
                  onChange={(e) => updateNested('layout', { avatarSize: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Header Padding (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.layout.headerPadding}px
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="32"
                  step="2"
                  value={settings.layout.headerPadding}
                  onChange={(e) => updateNested('layout', { headerPadding: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Button Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-6">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Palette className="w-5 h-5 text-red-600" />
              Button Settings
            </h3>
            
            {/* Camera Button */}
            <div className="border-l-4 border-purple-500 pl-4 space-y-4 bg-white rounded-r-lg p-4">
              <h4 className="font-semibold text-gray-800 text-base flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Camera Button
              </h4>
              
              {/* Color Section */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.cameraButton.color}
                    onChange={(e) => updateNested('cameraButton', { color: e.target.value })}
                    className="w-14 h-14 rounded-lg border-2 border-gray-300 cursor-pointer shadow-sm"
                  />
                  <input
                    type="text"
                    value={settings.cameraButton.color}
                    onChange={(e) => updateNested('cameraButton', { color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {/* Opacity Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-gray-700">Opacity</label>
                  <span className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">
                    {Math.round(settings.cameraButton.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.cameraButton.opacity}
                  onChange={(e) => updateNested('cameraButton', { opacity: parseFloat(e.target.value) })}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Size Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-gray-700">Size</label>
                  <span className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">
                    {settings.cameraButton.size}px
                  </span>
                </div>
                <input
                  type="range"
                  min="32"
                  max="80"
                  step="1"
                  value={settings.cameraButton.size}
                  onChange={(e) => updateNested('cameraButton', { size: parseInt(e.target.value) })}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>32px</span>
                  <span>56px</span>
                  <span>80px</span>
                </div>
              </div>

              {/* Position Section */}
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <label className="block text-sm font-semibold text-gray-700">Position (Placement)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-600">Top (rem)</label>
                      <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {settings.cameraButton.position.top}rem
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={settings.cameraButton.position.top}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <input
                      type="number"
                      value={settings.cameraButton.position.top}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      step="0.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-600">Left (rem)</label>
                      <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {settings.cameraButton.position.left}rem
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={settings.cameraButton.position.left}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <input
                      type="number"
                      value={settings.cameraButton.position.left}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Paper Clip Button */}
            <div className="border-l-4 border-blue-500 pl-4 space-y-4 bg-white rounded-r-lg p-4">
              <h4 className="font-semibold text-gray-800 text-base flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Paper Clip Button
              </h4>
              
              {/* Color Section */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.paperClipButton.color}
                    onChange={(e) => updateNested('paperClipButton', { color: e.target.value })}
                    className="w-14 h-14 rounded-lg border-2 border-gray-300 cursor-pointer shadow-sm"
                  />
                  <input
                    type="text"
                    value={settings.paperClipButton.color}
                    onChange={(e) => updateNested('paperClipButton', { color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {/* Opacity Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-gray-700">Opacity</label>
                  <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                    {Math.round(settings.paperClipButton.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.paperClipButton.opacity}
                  onChange={(e) => updateNested('paperClipButton', { opacity: parseFloat(e.target.value) })}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Size Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-gray-700">Size</label>
                  <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                    {settings.paperClipButton.size}px
                  </span>
                </div>
                <input
                  type="range"
                  min="32"
                  max="80"
                  step="1"
                  value={settings.paperClipButton.size}
                  onChange={(e) => updateNested('paperClipButton', { size: parseInt(e.target.value) })}
                  className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>32px</span>
                  <span>56px</span>
                  <span>80px</span>
                </div>
              </div>

              {/* Position Section */}
              <div className="space-y-3 pt-2 border-t border-gray-200">
                <label className="block text-sm font-semibold text-gray-700">Position (Placement)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-600">Top (rem)</label>
                      <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {settings.paperClipButton.position.top}rem
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={settings.paperClipButton.position.top}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <input
                      type="number"
                      value={settings.paperClipButton.position.top}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      step="0.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-600">Left (rem)</label>
                      <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                        {settings.paperClipButton.position.left}rem
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={settings.paperClipButton.position.left}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <input
                      type="number"
                      value={settings.paperClipButton.position.left}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            
            
            {/* Button Gap */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Button Gap (rem)</label>
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
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
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
