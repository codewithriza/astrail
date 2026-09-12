import Link from "next/link";
import Image from "next/image";

type AstrailLogoProps = {
  href?: string;
  inverse?: boolean;
  labelClassName?: string;
  markClassName?: string;
  className?: string;
};

export function AstrailLogo({
  href = "/",
  inverse = false,
  labelClassName = "text-2xl",
  markClassName = "h-9 w-9",
  className = "",
}: AstrailLogoProps) {
  const content = (
    <>
      <Image
        src={inverse ? "/brand/astrail-mark-inverse.svg" : "/brand/astrail-mark.svg"}
        alt=""
        width={512}
        height={512}
        className={`${markClassName} shrink-0`}
      />
      <span className={`font-black tracking-tight ${labelClassName}`}>Astrail</span>
    </>
  );

  return (
    <Link href={href} className={`inline-flex items-center gap-3 ${className}`}>
      {content}
    </Link>
  );
}
