import Image from "next/image";
import Link from "next/link";
import styles from "./Logo.module.css";

const heights = { small: 32, medium: 40, large: 48 };
const widths = { small: 89, medium: 111, large: 133 };

export function Logo({ size = "medium" }) {
  const height = heights[size];
  const width = widths[size];

  return (
    <Link href="/" className={styles.logo} aria-label="GhostSEO">
      <Image
        src="/logo-light.svg"
        alt="GhostSEO"
        width={width}
        height={height}
        className={`${styles.image} ${styles.lightLogo}`}
        priority
      />
      <Image
        src="/logo-dark.svg"
        alt="GhostSEO"
        width={width}
        height={height}
        className={`${styles.image} ${styles.darkLogo}`}
        priority
      />
    </Link>
  );
}
