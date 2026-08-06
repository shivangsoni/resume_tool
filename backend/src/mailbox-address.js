/** Build the user's ApplyPilot inbound address from env + mailbox alias. */
export function addressForAlias(alias) {
  if (!alias) return null;
  const domain = process.env.MAILBOX_DOMAIN;
  if (domain) return `${alias}@${domain}`;
  const inbound = process.env.POSTMARK_INBOUND_ADDRESS || "";
  const [local, host] = inbound.split("@");
  return local && host ? `${local}+${alias}@${host}` : null;
}
