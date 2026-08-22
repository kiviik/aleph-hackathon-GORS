// Approval-state labels. Nothing else.
//
// 2026-07-24 audit: this file used to export a roster of six invented people
// (TEAM / DESIGNERS / CREATIVE_APPROVERS / COMMERCIAL_APPROVERS and
// DEFAULT_DESIGNER_ID / DEFAULT_APPROVER_ID). Studio and Review rendered
// "Aprobar como {persona}" where the persona was chosen by whoever was
// approving — an approval attributable to nobody. The real team now comes from
// the engine (`GET /brands/{id}/users`) via components/IdentityProvider.
//
// The roster is deliberately NOT replaced with a fallback. With no users
// configured the UI states that and blocks assignment; offering invented people
// to be responsible for real work is the failure being fixed.

export function approvalLabel(status) {
  return {
    draft: "Borrador",
    in_progress: "En diseño",
    in_review: "En revisión",
    changes: "Cambios pedidos",
    approved: "Aprobada",
  }[status] || "Borrador";
}
