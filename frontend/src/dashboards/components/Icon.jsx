// Single reusable icon component.
// Usage: <Icon name="bell" className="u-c-red" />
// Replaces every hand-written <i class="ti ti-xxx" aria-hidden="true"></i> in the old HTML.
export default function Icon({ name, className = '', ...rest }) {
  return <i className={`ti ti-${name} ${className}`.trim()} aria-hidden="true" {...rest} />;
}
