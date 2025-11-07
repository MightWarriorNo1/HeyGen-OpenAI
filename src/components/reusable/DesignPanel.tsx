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
  micButton: {
    color: string;
    hoverColor: string;
    size: number;
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
    chatArea: {
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
    updateSettings({
      [key]: { ...settings[key], ...updates }
    } as Partial<DesignSettings>);
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
          {/* Text Colors Section */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-600" />
              Text Colors
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">User Message Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.textColors.userMessage}
                    onChange={(e) => updateNested('textColors', { userMessage: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.textColors.userMessage}
                    onChange={(e) => updateNested('textColors', { userMessage: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assistant Message Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.textColors.assistantMessage}
                    onChange={(e) => updateNested('textColors', { assistantMessage: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.textColors.assistantMessage}
                    onChange={(e) => updateNested('textColors', { assistantMessage: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.textColors.header}
                    onChange={(e) => updateNested('textColors', { header: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.textColors.header}
                    onChange={(e) => updateNested('textColors', { header: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Button Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.textColors.buttonText}
                    onChange={(e) => updateNested('textColors', { buttonText: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.textColors.buttonText}
                    onChange={(e) => updateNested('textColors', { buttonText: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          

          {/* Font Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Type className="w-5 h-5 text-green-600" />
              Font Settings
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Font Family</label>
              <select
                value={settings.fonts.family}
                onChange={(e) => updateNested('fonts', { family: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {fontFamilies.map(font => (
                  <option key={font} value={font}>{font.split(',')[0]}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Font Size (px)</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.fonts.size}px
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="24"
                  step="1"
                  value={settings.fonts.size}
                  onChange={(e) => updateNested('fonts', { size: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Font Weight</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.fonts.weight}
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="900"
                  step="100"
                  value={settings.fonts.weight}
                  onChange={(e) => updateNested('fonts', { weight: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Line Height</label>
                  <span className="text-sm font-semibold text-gray-900 bg-white px-2 py-1 rounded">
                    {settings.fonts.lineHeight}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.1"
                  value={settings.fonts.lineHeight}
                  onChange={(e) => updateNested('fonts', { lineHeight: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            </div>
          </div>

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
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Palette className="w-5 h-5 text-red-600" />
              Button Settings
            </h3>
            
            {/* Camera Button */}
            <div className="border-l-4 border-purple-500 pl-4 space-y-3">
              <h4 className="font-semibold text-gray-700">Camera Button</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.cameraButton.color}
                      onChange={(e) => updateNested('cameraButton', { color: e.target.value })}
                      className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.cameraButton.color}
                      onChange={(e) => updateNested('cameraButton', { color: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Opacity</label>
                    <span className="text-xs font-semibold">{Math.round(settings.cameraButton.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.cameraButton.opacity}
                    onChange={(e) => updateNested('cameraButton', { opacity: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Size (px)</label>
                    <span className="text-xs font-semibold">{settings.cameraButton.size}px</span>
                  </div>
                  <input
                    type="range"
                    min="32"
                    max="80"
                    step="1"
                    value={settings.cameraButton.size}
                    onChange={(e) => updateNested('cameraButton', { size: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Top (rem)</label>
                    <input
                      type="number"
                      value={settings.cameraButton.position.top}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Left (rem)</label>
                    <input
                      type="number"
                      value={settings.cameraButton.position.left}
                      onChange={(e) => updateNested('cameraButton', {
                        position: { ...settings.cameraButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Paper Clip Button */}
            <div className="border-l-4 border-blue-500 pl-4 space-y-3">
              <h4 className="font-semibold text-gray-700">Paper Clip Button</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.paperClipButton.color}
                      onChange={(e) => updateNested('paperClipButton', { color: e.target.value })}
                      className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.paperClipButton.color}
                      onChange={(e) => updateNested('paperClipButton', { color: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Opacity</label>
                    <span className="text-xs font-semibold">{Math.round(settings.paperClipButton.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.paperClipButton.opacity}
                    onChange={(e) => updateNested('paperClipButton', { opacity: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">Size (px)</label>
                    <span className="text-xs font-semibold">{settings.paperClipButton.size}px</span>
                  </div>
                  <input
                    type="range"
                    min="32"
                    max="80"
                    step="1"
                    value={settings.paperClipButton.size}
                    onChange={(e) => updateNested('paperClipButton', { size: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Top (rem)</label>
                    <input
                      type="number"
                      value={settings.paperClipButton.position.top}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, top: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Left (rem)</label>
                    <input
                      type="number"
                      value={settings.paperClipButton.position.left}
                      onChange={(e) => updateNested('paperClipButton', {
                        position: { ...settings.paperClipButton.position, left: parseFloat(e.target.value) }
                      })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
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

          {/* Background Colors */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-600" />
              Background Colors
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Page Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.backgrounds.page}
                    onChange={(e) => updateNested('backgrounds', { page: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.backgrounds.page}
                    onChange={(e) => updateNested('backgrounds', { page: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.backgrounds.header}
                    onChange={(e) => updateNested('backgrounds', { header: e.target.value })}
                    className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.backgrounds.header}
                    onChange={(e) => updateNested('backgrounds', { header: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Position Settings */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Move className="w-5 h-5 text-teal-600" />
              Position Settings
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-l-4 border-teal-500 pl-4">
                <h4 className="font-semibold text-gray-700 mb-3">Header Position</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Top (rem)</label>
                    <input
                      type="number"
                      value={settings.positions.header.top}
                      onChange={(e) => updateNested('positions', {
                        header: { ...settings.positions.header, top: parseFloat(e.target.value) }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Left (rem)</label>
                    <input
                      type="number"
                      value={settings.positions.header.left}
                      onChange={(e) => updateNested('positions', {
                        header: { ...settings.positions.header, left: parseFloat(e.target.value) }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
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
