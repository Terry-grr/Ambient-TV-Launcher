import React from 'react';
import {
  Compass,
  Film,
  Gamepad2,
  Globe,
  HardDrive,
  MonitorPlay,
  Music2,
  Play,
  Radio,
  Sparkles,
  Tv,
  Video,
} from 'lucide-react';

interface AppIconGlyphProps {
  iconKey: string;
  accentColor: string;
  size?: number;
  className?: string;
}

export const AppIconGlyph: React.FC<AppIconGlyphProps> = ({
  iconKey,
  accentColor,
  size = 28,
  className,
}) => {
  const commonProps = {
    size,
    strokeWidth: 1.9,
    className,
    style: { color: accentColor },
  };

  switch (iconKey) {
    case 'youtube':
    case 'smarttube':
      return <Play {...commonProps} fill={accentColor} fillOpacity={0.22} />;
    case 'netflix':
      return <Film {...commonProps} />;
    case 'plex':
    case 'jellyfin':
      return <HardDrive {...commonProps} />;
    case 'spotify':
      return <Music2 {...commonProps} />;
    case 'twitch':
      return <Radio {...commonProps} />;
    case 'prime':
    case 'appletv':
      return <Tv {...commonProps} />;
    case 'disney':
      return <Sparkles {...commonProps} />;
    case 'kodi':
      return <MonitorPlay {...commonProps} />;
    case 'stremio':
      return <Video {...commonProps} />;
    case 'steam':
      return <Gamepad2 {...commonProps} />;
    case 'vlc':
      return <Compass {...commonProps} />;
    case 'browser':
      return <Globe {...commonProps} />;
    default:
      return <Tv {...commonProps} />;
  }
};
