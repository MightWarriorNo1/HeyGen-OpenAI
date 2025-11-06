// src/components/reusable/Video.tsx
import { forwardRef } from 'react';

interface VideoProps {
  className?: string;
  onClick?: () => void;
}

const Video = forwardRef<HTMLVideoElement, VideoProps>(({ className = "", onClick }, ref) => {
  // Check if className contains positioning classes (fixed, absolute, relative, etc.)
  const hasPositioning = /(fixed|absolute|relative|sticky)/.test(className);
  
  // If positioning classes are present, apply them to wrapper; otherwise use default full-screen
  const wrapperClassName = hasPositioning 
    ? className 
    : "w-full h-full";
  
  // Video element class - use full size if wrapper has positioning, otherwise use provided className
  const videoClassName = hasPositioning
    ? "w-full h-full object-cover rounded-lg"
    : `w-full h-full object-cover rounded-lg lg:rounded-none ${className}`;
  
  return (
    <div className={wrapperClassName}>
      <video 
        playsInline 
        autoPlay 
        ref={ref} 
        className={videoClassName}
        muted={false}
        controls={false}
        onClick={onClick}
      />
    </div>
  );
});

export { Video };
