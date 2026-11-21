/**
 * Decorative page atmosphere — tints from the viewer's Colors
 * (`--navy` accent, `--page` background). Does not override titles or tables.
 */
export function QuietWaves() {
  return (
    <div className="quiet-waves" aria-hidden="true">
      <svg
        className="quiet-waves-top"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0,64 C180,120 360,0 540,48 C720,96 900,140 1080,72 C1140,48 1180,40 1200,36 L1200,0 L0,0 Z"
        />
        <path
          fill="currentColor"
          opacity="0.55"
          d="M0,96 C200,40 400,130 600,90 C800,50 1000,20 1200,80 L1200,0 L0,0 Z"
        />
      </svg>
      <svg
        className="quiet-waves-bottom"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0,64 C180,120 360,0 540,48 C720,96 900,140 1080,72 C1140,48 1180,40 1200,36 L1200,0 L0,0 Z"
        />
      </svg>
    </div>
  );
}
