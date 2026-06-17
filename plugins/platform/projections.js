function latestBodiesByProcess(witnesses, process) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== process || !witness.body?.id) continue;
    rows.set(String(witness.body.id), witness.body);
  }
  return rows;
}

function pushByKey(target, key, value) {
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function sortRows(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const next = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
      if (next) return next;
    }
    return 0;
  });
}

function changeSetEditRows(witnesses) {
  const latest = new Map();
  for (const witness of witnesses) {
    if (witness.process === "platform.changeSet.edit.upsert" && witness.body?.id) {
      const body = witness.body;
      latest.set(String(body.id), {
        id: String(body.id),
        changeSetId: String(body.changeSetId),
        path: String(body.path),
        pathHash: String(body.pathHash),
        previousHash: body.previousHash ?? null,
        nextContentHash: String(body.nextContentHash),
        nextContent: String(body.nextContent ?? ""),
        sourceLanguage: String(body.sourceLanguage || "text"),
        actor: body.actor ? String(body.actor) : null,
        session: body.session ? String(body.session) : null,
        updatedAt: body.updatedAt ?? null
      });
      continue;
    }
    if (witness.process === "platform.changeSet.edit.remove" && witness.body?.id) {
      latest.delete(String(witness.body.id));
    }
  }
  return sortRows([...latest.values()], ["changeSetId", "path"]);
}

function candidateSnapshotRows(witnesses) {
  const rows = [];
  for (const witness of witnesses) {
    if (witness.process !== "platform.changeSet.validate" || !witness.body?.candidateSnapshot?.id) continue;
    const snapshot = witness.body.candidateSnapshot;
    rows.push({
      id: String(snapshot.id),
      changeSetId: String(snapshot.changeSetId),
      branchId: String(snapshot.branchId),
      status: String(snapshot.status || "invalid"),
      revision: Number(snapshot.revision || 0),
      createdAt: snapshot.createdAt ?? null,
      files: Array.isArray(snapshot.files) ? snapshot.files.map(file => ({ ...file })) : [],
      errors: Array.isArray(snapshot.errors) ? snapshot.errors.map(error => ({ ...error })) : [],
      previousActiveCandidateSnapshotId: snapshot.previousActiveCandidateSnapshotId ?? null,
      activeCandidateSnapshotId: witness.body.activeCandidateSnapshotId ?? null
    });
  }
  return sortRows(rows, ["branchId", "changeSetId", "id"]);
}

export const platformModuleProjectors = {
  changeSetEdits(witnesses) {
    return changeSetEditRows(witnesses);
  },

  changeSetEditIndex(witnesses) {
    const rows = platformModuleProjectors.changeSetEdits(witnesses);
    const byId = Object.create(null);
    const byChangeSet = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byChangeSet, row.changeSetId, row);
    }
    return { rows, byId, byChangeSet };
  },

  candidateSnapshots(witnesses) {
    return candidateSnapshotRows(witnesses);
  },

  candidateSnapshotIndex(witnesses) {
    const rows = platformModuleProjectors.candidateSnapshots(witnesses);
    const byId = Object.create(null);
    const byChangeSet = Object.create(null);
    const byBranch = Object.create(null);
    const activeByBranch = Object.create(null);
    for (const row of rows) {
      byId[row.id] = row;
      pushByKey(byChangeSet, row.changeSetId, row);
      pushByKey(byBranch, row.branchId, row);
      if (row.status === "valid") activeByBranch[row.branchId] = row;
    }
    return { rows, byId, byChangeSet, byBranch, activeByBranch };
  },

  branches(witnesses) {
    const latest = latestBodiesByProcess(witnesses, "platform.branch.create");
    const rows = new Map();
    for (const body of latest.values()) {
      rows.set(String(body.id), {
        id: String(body.id),
        title: String(body.title || body.id),
        parentBranchId: body.parentBranchId ? String(body.parentBranchId) : null,
        epic: body.epic ? String(body.epic) : null,
        feature: body.feature ? String(body.feature) : null,
        defect: body.defect ? String(body.defect) : null,
        owner: body.owner ? String(body.owner) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        session: body.session ? String(body.session) : null,
        status: String(body.status || "open"),
        createdAt: body.createdAt ?? null,
        changeSetIds: [],
        latestCandidateSnapshotId: null
      });
    }
    for (const witness of witnesses) {
      if (witness.process === "platform.changeSet.create" && witness.body?.branchId && witness.body?.id) {
        const row = rows.get(String(witness.body.branchId));
        if (row && !row.changeSetIds.includes(String(witness.body.id))) row.changeSetIds.push(String(witness.body.id));
      }
      if (witness.process === "platform.changeSet.validate" && witness.body?.branchId) {
        const row = rows.get(String(witness.body.branchId));
        if (!row) continue;
        row.status = witness.body.status === "valid" ? "valid" : "blocked";
        row.latestCandidateSnapshotId = witness.body.candidateSnapshot?.id ?? row.latestCandidateSnapshotId;
      }
      if (witness.process === "platform.changeSet.apply" && witness.body?.branchId) {
        const row = rows.get(String(witness.body.branchId));
        if (!row) continue;
        row.latestCandidateSnapshotId = witness.body.candidateSnapshotId ?? row.latestCandidateSnapshotId;
      }
    }
    return sortRows([...rows.values()].map(row => ({
      ...row,
      changeSetIds: [...row.changeSetIds].sort()
    })), ["id"]);
  },

  branchIndex(witnesses) {
    const rows = platformModuleProjectors.branches(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  },

  changeSets(witnesses) {
    const latest = latestBodiesByProcess(witnesses, "platform.changeSet.create");
    const rows = new Map();
    for (const body of latest.values()) {
      rows.set(String(body.id), {
        id: String(body.id),
        branchId: String(body.branchId),
        title: String(body.title || body.id),
        reason: body.reason ? String(body.reason) : null,
        owner: body.owner ? String(body.owner) : null,
        runtimeProfile: body.runtimeProfile ? String(body.runtimeProfile) : null,
        session: body.session ? String(body.session) : null,
        status: String(body.status || "draft"),
        createdAt: body.createdAt ?? null,
        latestCandidateSnapshotId: null,
        activeCandidateSnapshotId: null,
        validationCount: 0,
        appliedAt: null
      });
    }
    for (const witness of witnesses) {
      const changeSetId = witness.process === "platform.changeSet.edit.upsert" || witness.process === "platform.changeSet.edit.remove"
        ? String(witness.body?.changeSetId || "")
        : String(witness.body?.id || "");
      const row = rows.get(changeSetId);
      if (!row) continue;
      if (witness.process === "platform.changeSet.edit.upsert" || witness.process === "platform.changeSet.edit.remove") {
        row.status = "draft";
        continue;
      }
      if (witness.process === "platform.changeSet.validate") {
        row.status = String(witness.body.status || row.status);
        row.latestCandidateSnapshotId = witness.body.candidateSnapshot?.id ?? row.latestCandidateSnapshotId;
        row.activeCandidateSnapshotId = witness.body.activeCandidateSnapshotId ?? row.activeCandidateSnapshotId;
        row.validationCount += 1;
        continue;
      }
      if (witness.process === "platform.changeSet.apply") {
        row.status = "applied";
        row.latestCandidateSnapshotId = witness.body.candidateSnapshotId ?? row.latestCandidateSnapshotId;
        row.appliedAt = witness.body.appliedAt ?? null;
        continue;
      }
      if (witness.process === "platform.changeSet.reject") {
        row.status = "rejected";
        continue;
      }
      if (witness.process === "platform.changeSet.abandon") {
        row.status = "abandoned";
      }
    }
    const editIndex = platformModuleProjectors.changeSetEditIndex(witnesses);
    return sortRows([...rows.values()].map(row => ({
      ...row,
      editCount: (editIndex.byChangeSet[row.id] ?? []).length
    })), ["id"]);
  },

  changeSetIndex(witnesses) {
    const rows = platformModuleProjectors.changeSets(witnesses);
    const byId = Object.create(null);
    for (const row of rows) byId[row.id] = row;
    return { rows, byId };
  }
};
