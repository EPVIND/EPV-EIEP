export interface EnvironmentBannerProps {
  readonly environment: string;
  readonly training: boolean;
}

export function EnvironmentBanner({ environment, training }: EnvironmentBannerProps) {
  const label = training ? "TRAINING / NONPRODUCTION" : environment.toUpperCase();
  return (
    <div className={`environment-banner${training ? " environment-banner--training" : ""}`} role="status">
      {label}
    </div>
  );
}

