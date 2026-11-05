import React from "react";
import Icon, { IconName } from "./Icon";
import cx from "./cx";
import s from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  block?: boolean;
  "data-testid"?: string;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(s.btn, s[variant], s[size], block && s.block, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: "plain" | "solid" | "overlay";
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger" | "accent";
  "data-testid"?: string;
}

export function IconButton({
  icon,
  label,
  variant = "plain",
  size = "md",
  tone = "default",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(s.iconBtn, s[`icon_${variant}`], s[`icon_${size}`], s[`tone_${tone}`], className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {children}
    </button>
  );
}
