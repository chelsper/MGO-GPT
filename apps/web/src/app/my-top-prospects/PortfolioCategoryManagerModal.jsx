"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function PortfolioCategoryManagerModal({
  categories,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onChangeParent,
  onMoveCategory,
  isCreating = false,
  renamingCategoryId = "",
  deletingCategoryId = "",
  changingCategoryParentId = "",
  movingCategoryId = "",
}) {
  const [newName, setNewName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const categoryById = new Map(
    categories.map((category) => [String(category.id), category]),
  );

  const isDescendantOf = (category, possibleAncestorId) => {
    let current = category;
    const visited = new Set();

    while (current?.parent_category_id && !visited.has(String(current.id))) {
      visited.add(String(current.id));
      if (String(current.parent_category_id) === String(possibleAncestorId)) {
        return true;
      }
      current = categoryById.get(String(current.parent_category_id));
    }

    return false;
  };

  const submitNewCategory = async (event) => {
    event.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Enter a category name.");
      return;
    }

    try {
      setError("");
      await onCreate(trimmedName);
      setNewName("");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create this category.",
      );
    }
  };

  const submitRename = async (category) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setError("Enter a category name.");
      return;
    }

    try {
      setError("");
      await onRename(category, trimmedName);
      setEditingCategoryId("");
      setEditingName("");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to rename this category.",
      );
    }
  };

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(
      `Delete ${category.name}? Constituents in this category will become Uncategorized, and its subcategories will become top-level categories. This does not change anything in NXT.`,
    );
    if (!confirmed) return;

    try {
      setError("");
      await onDelete(category);
      if (editingCategoryId === String(category.id)) {
        setEditingCategoryId("");
        setEditingName("");
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to delete this category.",
      );
    }
  };

  const changeCategoryParent = async (category, parentCategoryId) => {
    try {
      setError("");
      await onChangeParent(category, parentCategoryId);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to move this category.",
      );
    }
  };

  const moveCategory = async (category, direction) => {
    try {
      setError("");
      await onMoveCategory(category, direction);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to reorder this category.",
      );
    }
  };

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #D1D5DB",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "#111827",
    backgroundColor: "white",
  };

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        backgroundColor: "rgba(17, 24, 39, 0.5)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-category-manager-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, 620px)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          backgroundColor: "white",
          borderRadius: "16px",
          boxShadow: "0 24px 48px rgba(17, 24, 39, 0.24)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            padding: "20px 22px 16px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div>
            <h2
              id="portfolio-category-manager-title"
              style={{ margin: 0, fontSize: "20px", color: "#111827" }}
            >
              Organize my portfolio
            </h2>
            <div style={{ marginTop: "5px", fontSize: "14px", color: "#4B5563", lineHeight: 1.45 }}>
              Categories are private to your JUMGOGPT portfolio. They never change NXT solicitor assignments or Top Prospects.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              backgroundColor: "transparent",
              color: "#6B7280",
              cursor: "pointer",
              padding: "2px",
            }}
          >
            <X size={22} />
          </button>
        </div>

        <div style={{ padding: "20px 22px 22px" }}>
          <form onSubmit={submitNewCategory} style={{ display: "flex", gap: "10px", alignItems: "end" }}>
            <label style={{ display: "grid", gap: "7px", flex: 1 }}>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>
                New category
              </span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="For example, Marine Science or Stewardship"
                maxLength={80}
                style={fieldStyle}
              />
            </label>
            <button
              type="submit"
              disabled={isCreating}
              style={{
                border: "none",
                borderRadius: "8px",
                padding: "10px 14px",
                backgroundColor: "#4F46E5",
                color: "white",
                fontSize: "14px",
                fontWeight: "700",
                cursor: isCreating ? "not-allowed" : "pointer",
                opacity: isCreating ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {isCreating ? "Creating..." : "Create category"}
            </button>
          </form>

          {error ? (
            <div
              style={{
                marginTop: "16px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #FECACA",
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ marginTop: "22px", display: "grid", gap: "10px" }}>
            {categories.length ? (
              categories.map((category) => {
                const isEditing = editingCategoryId === String(category.id);
                const isRenaming = String(renamingCategoryId || "") === String(category.id);
                const isDeleting = String(deletingCategoryId || "") === String(category.id);
                const isChangingParent =
                  String(changingCategoryParentId || "") === String(category.id);
                const isMoving = String(movingCategoryId || "") === String(category.id);
                const parentCategory = categoryById.get(
                  String(category.parent_category_id || ""),
                );
                const parentCandidates = categories.filter(
                  (candidate) =>
                    String(candidate.id) !== String(category.id) &&
                    !isDescendantOf(candidate, category.id),
                );
                const siblings = categories
                  .filter(
                    (candidate) =>
                      String(candidate.parent_category_id || "") ===
                      String(category.parent_category_id || ""),
                  )
                  .sort(
                    (left, right) =>
                      Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
                      Number(left.id) - Number(right.id),
                  );
                const siblingIndex = siblings.findIndex(
                  (candidate) => String(candidate.id) === String(category.id),
                );

                return (
                  <div
                    key={category.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "10px",
                      padding: "13px 14px",
                      backgroundColor: "#FAFAFA",
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={80}
                          aria-label={`Rename ${category.name}`}
                          style={fieldStyle}
                        />
                        <button
                          type="button"
                          onClick={() => submitRename(category)}
                          disabled={isRenaming}
                          style={{
                            border: "none",
                            borderRadius: "7px",
                            padding: "9px 11px",
                            backgroundColor: "#4F46E5",
                            color: "white",
                            fontSize: "13px",
                            fontWeight: "700",
                            cursor: isRenaming ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isRenaming ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId("");
                            setEditingName("");
                          }}
                          disabled={isRenaming}
                          style={{
                            border: "1px solid #D1D5DB",
                            borderRadius: "7px",
                            padding: "9px 11px",
                            backgroundColor: "white",
                            color: "#374151",
                            fontSize: "13px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center" }}>
                        <div>
                          <div style={{ color: "#111827", fontWeight: "800", fontSize: "15px" }}>
                            {category.name}
                          </div>
                          <div style={{ marginTop: "3px", color: "#6B7280", fontSize: "13px" }}>
                            {Number(category.assignment_count || 0)} constituent{Number(category.assignment_count || 0) === 1 ? "" : "s"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(String(category.id));
                              setEditingName(category.name || "");
                              setError("");
                            }}
                            disabled={isDeleting}
                            style={{
                              border: "1px solid #C7D2FE",
                              borderRadius: "7px",
                              padding: "8px 10px",
                              backgroundColor: "white",
                              color: "#4338CA",
                              fontSize: "13px",
                              fontWeight: "700",
                              cursor: isDeleting ? "not-allowed" : "pointer",
                            }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCategory(category)}
                            disabled={isDeleting}
                            style={{
                              border: "1px solid #FECACA",
                              borderRadius: "7px",
                              padding: "8px 10px",
                              backgroundColor: "white",
                              color: "#B91C1C",
                              fontSize: "13px",
                              fontWeight: "700",
                              cursor: isDeleting ? "not-allowed" : "pointer",
                            }}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    )}
                    {!isEditing ? (
                      <div style={{ marginTop: "11px", display: "grid", gap: "10px" }}>
                        <label style={{ display: "grid", gap: "5px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "#4B5563" }}>
                            Parent category
                          </span>
                          <select
                            value={category.parent_category_id || ""}
                            onChange={(event) =>
                              changeCategoryParent(category, event.target.value || null)
                            }
                            disabled={isChangingParent || isDeleting}
                            style={fieldStyle}
                          >
                            <option value="">Top level</option>
                            {parentCandidates.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => moveCategory(category, "up")}
                            disabled={isMoving || isDeleting || siblingIndex <= 0}
                            style={{
                              border: "1px solid #C7D2FE",
                              borderRadius: "7px",
                              padding: "8px 10px",
                              backgroundColor: "white",
                              color: "#4338CA",
                              fontSize: "13px",
                              fontWeight: "700",
                              cursor: isMoving || isDeleting || siblingIndex <= 0 ? "not-allowed" : "pointer",
                              opacity: isMoving || isDeleting || siblingIndex <= 0 ? 0.55 : 1,
                            }}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategory(category, "down")}
                            disabled={
                              isMoving ||
                              isDeleting ||
                              siblingIndex < 0 ||
                              siblingIndex >= siblings.length - 1
                            }
                            style={{
                              border: "1px solid #C7D2FE",
                              borderRadius: "7px",
                              padding: "8px 10px",
                              backgroundColor: "white",
                              color: "#4338CA",
                              fontSize: "13px",
                              fontWeight: "700",
                              cursor:
                                isMoving ||
                                isDeleting ||
                                siblingIndex < 0 ||
                                siblingIndex >= siblings.length - 1
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                isMoving ||
                                isDeleting ||
                                siblingIndex < 0 ||
                                siblingIndex >= siblings.length - 1
                                  ? 0.55
                                  : 1,
                            }}
                          >
                            Move down
                          </button>
                          <span style={{ fontSize: "12px", color: "#6B7280" }}>
                            {isChangingParent
                              ? "Moving category..."
                              : isMoving
                                ? "Reordering category..."
                                : parentCategory
                                  ? `Inside ${parentCategory.name}`
                                  : "Top level"}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  border: "1px dashed #D1D5DB",
                  borderRadius: "10px",
                  padding: "18px",
                  color: "#6B7280",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                No categories yet. Create one to group prospects by interest or stage.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
