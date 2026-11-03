import React from 'react';

type FabsetuLogoVariant = 'dark' | 'transparent';

interface FabsetuLogoProps {
  variant?: FabsetuLogoVariant;
  width?: number | string;
  className?: string;
  alt?: string;
}

const logoSources: Record<FabsetuLogoVariant, string> = {
  dark: '/branding/fabsetu-logo-dark.jpg',
  transparent: '/branding/fabsetu-logo-transparent.png',
};

export const FabsetuLogo: React.FC<FabsetuLogoProps> = ({
  variant = 'transparent',
  width = 220,
  className = '',
  alt = 'FABSETU',
}) => (
  <img
    src={logoSources[variant]}
    alt={alt}
    width={width}
    height={Number(width) ? Math.round(Number(width) * 341 / 1024) : undefined}
    className={`block h-auto max-w-full object-contain aspect-[1024/341] ${className}`}
  />
);
