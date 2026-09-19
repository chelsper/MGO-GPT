"use client";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { isConstituentList, LEGACY_LIST_KEY } from "@/utils/constituentLists";
import styles from "@/components/reportConfigurationEditor.module.css";

export default function ListsPage() {
  const { visibleReports, canManage, isPending, error, refetch } =
    useReportConfigurations();
  const lists = visibleReports.filter(isConstituentList);
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <SharedReportHeader
          activeReportKey="lists"
          title="Lists"
          description="Open a shared constituent list configured by Advancement Services. New custom-field lists use saved results and refresh only when requested."
          accessibleReports={visibleReports}
          action={
            canManage ? (
              <a className={styles.button} href="/report-configurations">
                Configure lists
              </a>
            ) : null
          }
        />
        {isPending && <p role="status">Loading available lists...</p>}
        {error && (
          <section className={styles.notice} role="alert">
            {error.message}
            <p>
              <button className={styles.button} onClick={() => refetch()}>
                Try again
              </button>
            </p>
          </section>
        )}
        {!isPending && !error && !lists.length && (
          <section className={styles.card}>
            <h2 className={styles.listTitle}>No lists enabled yet</h2>
            <p>
              Advancement Services can configure a category-based list and
              select who may view it.
            </p>
            {canManage && (
              <a className={styles.button} href="/report-configurations">
                Set up a list
              </a>
            )}
          </section>
        )}
        <div className={styles.grid}>
          {lists.map((list) => (
            <article className={styles.card} key={list.key}>
              <span className={styles.tag}>
                {list.key === LEGACY_LIST_KEY
                  ? "Existing saved-query list"
                  : "NXT custom-field list"}
              </span>
              <h2 className={styles.listTitle}>{list.title}</h2>
              <p className={styles.muted}>
                {list.description || "Shared constituent list"}
              </p>
              {list.dataConfiguration?.fieldCategory && (
                <p>
                  {list.dataConfiguration.fieldCategory} /{" "}
                  {list.dataConfiguration.fieldDescription ||
                    "All descriptions"}
                </p>
              )}
              <a className={styles.button} href={getReportHref(list)}>
                Open list
              </a>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
