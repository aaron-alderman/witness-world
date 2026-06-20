use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, ToSql};
use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};
use wasmtime::{Caller, Config as WasmtimeConfig, Engine as WasmtimeEngine, Extern, ExternType, Linker, Module as WasmtimeModule, Store as WasmtimeStore, ValType};

const CAP_STORAGE_READ: &str = "storage.read";
const CAP_STORAGE_WRITE: &str = "storage.write";
const CAP_NOTIFY_SURFACE: &str = "notify.surface";
const CAP_PROOF_RUN: &str = "proof.run";
const CAP_PACKAGE_PROMOTE: &str = "package.promote";
const CAP_FS_READ: &str = "capability.fs.read";
const CAP_FS_WRITE: &str = "capability.fs.write";
const CAP_FS_PATCH: &str = "capability.fs.patch";
const CAP_FS_STAT: &str = "capability.fs.stat";
const CAP_NETWORK_HTTP_OUTBOUND: &str = "capability.network.http.outbound";
const CAP_DB_SQLITE: &str = "capability.db.sqlite";
const CAP_PROCESS_SOAK: &str = "process.soak";
const CAP_COMPUTE_EXECUTE: &str = "compute.execute";
const CAP_VERIFICATION_PERSISTENCE: &str = "verification.persistence";
const AUTHORING_WRITE_CONFLICT: &str = "authoring.write.conflict";
const AUTHORING_WRITE_REJECTED: &str = "authoring.write.rejected";
const COMPUTE_MODULE_RUNTIME_TARGET_HOST_OPERATION: &str = "engentus.pipeline.health.classify";
const COMPUTE_MODULE_IMPORT_NAMESPACE_V1: &str = "world_host_operation_v1";
const COMPUTE_MODULE_STORE_ROOT_V1: &str = ".witness-core/artifacts/compute-modules";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ServingMode {
    Live,
    Stable,
}

impl ServingMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Live => "live",
            Self::Stable => "stable",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "stable" => Self::Stable,
            _ => Self::Live,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GenerationState {
    Candidate,
    CompileFailed,
    ProofRunning,
    ProofFailed,
    GreenLocal,
    Stable,
    Retired,
}

impl GenerationState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Candidate => "candidate",
            Self::CompileFailed => "compile_failed",
            Self::ProofRunning => "proof_running",
            Self::ProofFailed => "proof_failed",
            Self::GreenLocal => "green_local",
            Self::Stable => "stable",
            Self::Retired => "retired",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "compile_failed" => Self::CompileFailed,
            "proof_running" => Self::ProofRunning,
            "proof_failed" => Self::ProofFailed,
            "green_local" => Self::GreenLocal,
            "stable" => Self::Stable,
            "retired" => Self::Retired,
            _ => Self::Candidate,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProofStatus {
    Running,
    Passed,
    Failed,
}

impl ProofStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Passed => "passed",
            Self::Failed => "failed",
        }
    }

}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ComputeModuleExecutionMode {
    Disabled,
    Shadow,
}

impl ComputeModuleExecutionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Shadow => "shadow",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "shadow" => Self::Shadow,
            _ => Self::Disabled,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Correlation {
    pub session_id: Option<String>,
    pub surface_id: Option<String>,
    pub actor: Option<String>,
}

impl Correlation {
    fn empty() -> Self {
        Self {
            session_id: None,
            surface_id: None,
            actor: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ProofRecord {
    pub name: String,
    pub command: String,
    pub status: ProofStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u128>,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Debug)]
pub struct ComputeModuleBuildRecord {
    pub id: String,
    pub host_operation: String,
    pub source: String,
    pub artifact_path: Option<String>,
    pub artifact_hash: Option<String>,
    pub store_path: Option<String>,
    pub language: String,
    pub abi: String,
    pub export_name: String,
    pub max_memory_pages: Option<u64>,
    pub timeout_ms: Option<u64>,
    pub allowed_bindings: Vec<String>,
    pub context: Option<String>,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
struct BuildWorkerResult {
    pub error: Option<String>,
    pub compute_module_count: usize,
    pub compute_modules: Vec<ComputeModuleBuildRecord>,
    pub raw_message: String,
}

#[derive(Clone, Debug)]
pub struct Generation {
    pub id: String,
    pub state: GenerationState,
    pub content_hash: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub source_paths: Vec<String>,
    pub compute_modules: Vec<ComputeModuleBuildRecord>,
    pub proofs: Vec<ProofRecord>,
    pub correlation: Correlation,
    pub promotion_decision: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Aliases {
    pub current_stable: Option<String>,
    pub current_green_local: Option<String>,
    pub last_good: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ServingDirective {
    pub requested_mode: ServingMode,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct ServingStatus {
    pub requested_mode: ServingMode,
    pub effective_mode: ServingMode,
    pub reason: String,
    pub updated_at: String,
    pub latest_generation_id: Option<String>,
    pub latest_generation_state: Option<String>,
    pub current_stable: Option<String>,
    pub current_green_local: Option<String>,
    pub last_good: Option<String>,
}

#[derive(Clone, Debug)]
pub struct WatchConfig {
    pub roots: Vec<String>,
    pub ignore: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct ProofConfig {
    pub fast: String,
    pub full: Option<String>,
    pub slow_ms: u64,
}

#[derive(Clone, Debug)]
pub struct PackageConfig {
    pub include: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct SuperviseConfig {
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub reload_url: Option<String>,
    pub restart_on_exit: bool,
    pub restart_on_unhealthy: bool,
    pub health_url: Option<String>,
    pub health_interval_ms: u64,
    pub health_timeout_ms: u64,
    pub degraded_grace_polls: u64,
    pub unhealthy_grace_polls: u64,
}

#[derive(Clone, Debug)]
pub struct FrontDoorConfig {
    pub public_addr: Option<String>,
    pub drain_timeout_ms: u64,
    pub startup_cutover_timeout_ms: u64,
}

#[derive(Clone, Debug)]
pub struct BuildWorkerConfig {
    pub command: Option<String>,
    pub working_dir: Option<String>,
}

#[derive(Clone, Debug)]
pub struct TransactionConfig {
    pub build_timeout_ms: u64,
    pub stage_root: String,
}

#[derive(Clone, Debug)]
pub struct ComputeModulesConfig {
    pub engine: String,
    pub execution_mode: ComputeModuleExecutionMode,
    pub artifact_store_root: String,
}

#[derive(Clone, Debug)]
pub struct CoreConfig {
    pub watch: WatchConfig,
    pub proof: ProofConfig,
    pub package: PackageConfig,
    pub supervise: SuperviseConfig,
    pub frontdoor: FrontDoorConfig,
    pub build_worker: BuildWorkerConfig,
    pub transaction: TransactionConfig,
    pub compute_modules: ComputeModulesConfig,
}

impl Default for CoreConfig {
    fn default() -> Self {
        Self {
            watch: WatchConfig {
                roots: vec!["src".to_string()],
                ignore: vec![
                    "node_modules".to_string(),
                    "target".to_string(),
                    ".git".to_string(),
                    ".witness-core".to_string(),
                ],
            },
            proof: ProofConfig {
                fast: "node --test src/runtime-surface-interaction-runtime.test.js".to_string(),
                full: Some("npm test".to_string()),
                slow_ms: 15_000,
            },
            package: PackageConfig {
                include: vec!["src/**".to_string()],
            },
            supervise: SuperviseConfig {
                command: None,
                working_dir: None,
                reload_url: None,
                restart_on_exit: true,
                restart_on_unhealthy: true,
                health_url: None,
                health_interval_ms: 500,
                health_timeout_ms: 10_000,
                degraded_grace_polls: 10,
                unhealthy_grace_polls: 3,
            },
            frontdoor: FrontDoorConfig {
                public_addr: None,
                drain_timeout_ms: 15_000,
                startup_cutover_timeout_ms: 45_000,
            },
            build_worker: BuildWorkerConfig {
                command: None,
                working_dir: None,
            },
            transaction: TransactionConfig {
                build_timeout_ms: 30_000,
                stage_root: ".witness-core/staging".to_string(),
            },
            compute_modules: ComputeModulesConfig {
                engine: "wasmtime".to_string(),
                execution_mode: ComputeModuleExecutionMode::Disabled,
                artifact_store_root: COMPUTE_MODULE_STORE_ROOT_V1.to_string(),
            },
        }
    }
}

#[derive(Clone, Debug)]
pub struct SupervisedProcessInstanceState {
    pub id: String,
    pub state: String,
    pub port: Option<u16>,
    pub running: bool,
    pub ready: bool,
    pub pid: Option<u32>,
    pub inflight_connections: u64,
    pub last_started_at: Option<String>,
    pub last_exited_at: Option<String>,
    pub last_health_status: Option<String>,
    pub drain_started_at: Option<String>,
    pub drain_finished_at: Option<String>,
    pub role: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SupervisedProcessState {
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub restart_on_exit: bool,
    pub restart_on_unhealthy: bool,
    pub running: bool,
    pub pid: Option<u32>,
    pub restart_count: u64,
    pub last_started_at: Option<String>,
    pub last_exited_at: Option<String>,
    pub last_exit_code: Option<i32>,
    pub last_error: Option<String>,
    pub ready: bool,
    pub last_ready_at: Option<String>,
    pub last_health_status: Option<String>,
    pub status: Option<String>,
    pub reason_codes: Vec<String>,
    pub last_health_sample_at: Option<String>,
    pub health_url: Option<String>,
    pub reload_url: Option<String>,
    pub degraded_streak: u64,
    pub unhealthy_streak: u64,
    pub last_restart_reason: Option<String>,
    pub restart_requested: bool,
    pub stop_requested: bool,
    pub instance_id: Option<String>,
    pub role: Option<String>,
    pub mutations_enabled: bool,
    pub watchers_enabled: bool,
    pub public_addr: Option<String>,
    pub frontdoor_enabled: bool,
    pub frontdoor_active_instance_id: Option<String>,
    pub frontdoor_active_target: Option<String>,
    pub frontdoor_active_reload_url: Option<String>,
    pub instances: Vec<SupervisedProcessInstanceState>,
}

#[derive(Clone, Debug)]
pub struct SoakMark {
    pub phase: String,
    pub message: Option<String>,
    pub marked_at: String,
}

#[derive(Clone, Debug, Default)]
pub struct SoakHighWater {
    pub rss: u64,
    pub heap_used: u64,
    pub event_loop_p95_ms: u64,
    pub active_requests: u64,
    pub sse_clients: u64,
    pub preview_sessions: u64,
    pub snapshot_watchers: u64,
    pub fswatcher_resources: u64,
    pub timeout_resources: u64,
    pub restart_count: u64,
}

#[derive(Clone, Debug)]
pub struct SoakSample {
    pub sequence: u64,
    pub phase: Option<String>,
    pub sampled_at: String,
    pub ready: bool,
    pub status: String,
    pub reason_codes: Vec<String>,
    pub rss: u64,
    pub heap_used: u64,
    pub event_loop_p95_ms: u64,
    pub active_requests: u64,
    pub sse_clients: u64,
    pub preview_sessions: u64,
    pub snapshot_watchers: u64,
    pub fswatcher_resources: u64,
    pub timeout_resources: u64,
    pub process_running: bool,
    pub process_ready: bool,
    pub pid: Option<u32>,
    pub restart_count: u64,
    pub serving_requested_mode: String,
    pub serving_effective_mode: String,
    pub serving_reason: String,
    pub latest_generation_id: Option<String>,
    pub latest_generation_state: Option<String>,
    pub stable_failover: bool,
}

#[derive(Clone, Debug)]
pub struct SoakSession {
    pub id: String,
    pub scenario: String,
    pub status: String,
    pub started_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub failure_reason: Option<String>,
    pub sample_count: u64,
    pub healthy_samples: u64,
    pub degraded_samples: u64,
    pub unhealthy_samples: u64,
    pub restart_observed: bool,
    pub stable_failover_observed: bool,
    pub start_restart_count: u64,
    pub latest_restart_count: u64,
    pub current_phase: Option<String>,
    pub latest_sample: Option<SoakSample>,
    pub marks: Vec<SoakMark>,
    pub high_water: SoakHighWater,
}

#[derive(Clone, Debug, Default)]
pub struct SoakState {
    pub current_session: Option<SoakSession>,
    pub last_session: Option<SoakSession>,
}

#[derive(Clone, Debug, Default)]
struct WatcherState {
    previous: BTreeMap<String, u128>,
}

impl Default for SupervisedProcessState {
    fn default() -> Self {
        Self {
            command: None,
            working_dir: None,
            restart_on_exit: false,
            restart_on_unhealthy: true,
            running: false,
            pid: None,
            restart_count: 0,
            last_started_at: None,
            last_exited_at: None,
            last_exit_code: None,
            last_error: None,
            ready: false,
            last_ready_at: None,
            last_health_status: None,
            status: None,
            reason_codes: Vec::new(),
            last_health_sample_at: None,
            health_url: None,
            reload_url: None,
            degraded_streak: 0,
            unhealthy_streak: 0,
            last_restart_reason: None,
            restart_requested: false,
            stop_requested: false,
            instance_id: None,
            role: None,
            mutations_enabled: true,
            watchers_enabled: true,
            public_addr: None,
            frontdoor_enabled: false,
            frontdoor_active_instance_id: None,
            frontdoor_active_target: None,
            frontdoor_active_reload_url: None,
            instances: Vec::new(),
        }
    }
}

impl SoakHighWater {
    fn absorb(&mut self, sample: &SoakSample) {
        self.rss = self.rss.max(sample.rss);
        self.heap_used = self.heap_used.max(sample.heap_used);
        self.event_loop_p95_ms = self.event_loop_p95_ms.max(sample.event_loop_p95_ms);
        self.active_requests = self.active_requests.max(sample.active_requests);
        self.sse_clients = self.sse_clients.max(sample.sse_clients);
        self.preview_sessions = self.preview_sessions.max(sample.preview_sessions);
        self.snapshot_watchers = self.snapshot_watchers.max(sample.snapshot_watchers);
        self.fswatcher_resources = self.fswatcher_resources.max(sample.fswatcher_resources);
        self.timeout_resources = self.timeout_resources.max(sample.timeout_resources);
        self.restart_count = self.restart_count.max(sample.restart_count);
    }
}

pub trait CoreStore: Send + Sync {
    fn append_event(&self, event: &CoreEvent) -> std::io::Result<()>;
    fn read_events(&self) -> std::io::Result<Vec<String>>;
}

#[derive(Clone)]
pub struct FileStore {
    root: PathBuf,
}

impl FileStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn journal_path(&self) -> PathBuf {
        self.root.join("events.jsonl")
    }
}

impl CoreStore for FileStore {
    fn append_event(&self, event: &CoreEvent) -> std::io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.journal_path())?;
        writeln!(file, "{}", event.to_json())
    }

    fn read_events(&self) -> std::io::Result<Vec<String>> {
        let path = self.journal_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let text = fs::read_to_string(path)?;
        Ok(text.lines().map(|line| line.to_string()).collect())
    }
}

#[derive(Clone, Debug)]
pub struct CoreEvent {
    pub kind: String,
    pub capability: String,
    pub generation_id: Option<String>,
    pub message: Option<String>,
    pub generation: Option<Generation>,
    pub serving: Option<ServingDirective>,
    pub emitted_at: String,
}

impl CoreEvent {
    pub fn new(kind: impl Into<String>, capability: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            capability: capability.into(),
            generation_id: None,
            message: None,
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        }
    }

    fn with_generation(mut self, generation: &Generation) -> Self {
        self.generation_id = Some(generation.id.clone());
        self.generation = Some(generation.clone());
        self
    }

    fn with_serving(mut self, serving: &ServingDirective) -> Self {
        self.serving = Some(serving.clone());
        self
    }

    fn to_json(&self) -> String {
        let mut fields = vec![
            json_pair("kind", &self.kind),
            json_pair("capability", &self.capability),
            json_pair("emittedAt", &self.emitted_at),
        ];
        fields.push(json_optional_pair("generationId", self.generation_id.as_deref()));
        fields.push(json_optional_pair("message", self.message.as_deref()));
        if let Some(generation) = &self.generation {
            fields.push(format!("\"generation\":{}", generation_to_json(generation)));
        }
        if let Some(serving) = &self.serving {
            fields.push(format!("\"serving\":{}", serving_directive_to_json(serving)));
        }
        format!("{{{}}}", fields.into_iter().filter(|v| !v.is_empty()).collect::<Vec<_>>().join(","))
    }
}

pub struct Registry {
    generations: BTreeMap<String, Generation>,
    preview_sessions: BTreeMap<String, String>,
    aliases: Aliases,
    serving: ServingDirective,
    last_effective_serving_mode: ServingMode,
    soak: SoakState,
    store: Arc<dyn CoreStore>,
    subscribers: Vec<mpsc::Sender<CoreEvent>>,
}

impl Registry {
    pub fn new(store: Arc<dyn CoreStore>) -> Self {
        let mut registry = Self {
            generations: BTreeMap::new(),
            preview_sessions: BTreeMap::new(),
            aliases: Aliases::default(),
            serving: ServingDirective {
                requested_mode: ServingMode::Live,
                updated_at: now_iso(),
            },
            last_effective_serving_mode: ServingMode::Live,
            soak: SoakState::default(),
            store,
            subscribers: Vec::new(),
        };
        registry.replay_journal();
        registry.last_effective_serving_mode = registry.effective_serving_mode();
        registry
    }

    pub fn aliases(&self) -> Aliases {
        self.aliases.clone()
    }

    pub fn generations(&self) -> Vec<Generation> {
        let mut generations = self.generations.values().cloned().collect::<Vec<_>>();
        generations.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        generations
    }

    pub fn generation(&self, id: &str) -> Option<Generation> {
        self.generations.get(id).cloned()
    }

    pub fn preview_session(&self, id: &str) -> Option<String> {
        self.preview_sessions.get(id).cloned()
    }

    pub fn soak_state(&self) -> SoakState {
        self.soak.clone()
    }

    pub fn serving_status(&self) -> ServingStatus {
        let latest = self.latest_generation();
        let effective_mode = self.effective_serving_mode();
        let reason = self.effective_serving_reason().to_string();
        ServingStatus {
            requested_mode: self.serving.requested_mode,
            effective_mode,
            reason,
            updated_at: self.serving.updated_at.clone(),
            latest_generation_id: latest.as_ref().map(|generation| generation.id.clone()),
            latest_generation_state: latest.as_ref().map(|generation| generation.state.as_str().to_string()),
            current_stable: self.aliases.current_stable.clone(),
            current_green_local: self.aliases.current_green_local.clone(),
            last_good: self.aliases.last_good.clone(),
        }
    }

    pub fn subscribe(&mut self) -> mpsc::Receiver<CoreEvent> {
        let (sender, receiver) = mpsc::channel();
        self.subscribers.push(sender);
        receiver
    }

    pub fn upsert_generation(&mut self, generation: Generation, kind: &str, capability: &str) {
        let previous_effective_mode = self.effective_serving_mode();
        self.generations.insert(generation.id.clone(), generation.clone());
        if generation.state == GenerationState::GreenLocal {
            self.aliases.current_green_local = Some(generation.id.clone());
        }
        if generation.state == GenerationState::Retired && self.aliases.current_green_local.as_deref() == Some(generation.id.as_str()) {
            self.aliases.current_green_local = self
                .generations()
                .into_iter()
                .filter(|entry| entry.state == GenerationState::GreenLocal)
                .last()
                .map(|entry| entry.id);
        }
        if generation.state == GenerationState::Stable {
            self.aliases.current_stable = Some(generation.id.clone());
            self.aliases.last_good = Some(generation.id.clone());
        }
        self.emit(CoreEvent::new(kind, capability).with_generation(&generation));
        self.emit_serving_effective_change_if_needed(previous_effective_mode);
    }

    pub fn promote(&mut self, id: &str) -> Result<Generation, String> {
        let mut generation = self.generations.get(id).cloned().ok_or_else(|| "generation not found".to_string())?;
        generation.state = GenerationState::Stable;
        generation.promotion_decision = Some("promoted-local".to_string());
        self.upsert_generation(generation.clone(), "generation.promoted", CAP_PACKAGE_PROMOTE);
        Ok(generation)
    }

    pub fn rollback(&mut self, id: &str) -> Result<Generation, String> {
        let mut generation = self.generations.get(id).cloned().ok_or_else(|| "generation not found".to_string())?;
        generation.state = GenerationState::Stable;
        generation.promotion_decision = Some("rollback-local".to_string());
        self.upsert_generation(generation.clone(), "generation.rollback", CAP_PACKAGE_PROMOTE);
        self.request_serving_mode(ServingMode::Stable);
        Ok(generation)
    }

    pub fn request_serving_mode(&mut self, mode: ServingMode) -> ServingStatus {
        let previous_effective_mode = self.effective_serving_mode();
        self.serving.requested_mode = mode;
        self.serving.updated_at = now_iso();
        let kind = match mode {
            ServingMode::Live => "serving.live.requested",
            ServingMode::Stable => "serving.stable.requested",
        };
        self.emit(CoreEvent::new(kind, CAP_PACKAGE_PROMOTE).with_serving(&self.serving));
        if let Some(event) = self.build_serving_effective_change_event(previous_effective_mode) {
            self.emit(event);
        }
        self.serving_status()
    }

    pub fn upsert_preview_session(&mut self, id: &str, document: String) -> String {
        self.preview_sessions.insert(id.to_string(), document.clone());
        self.emit(CoreEvent {
            kind: "preview.session.upsert".to_string(),
            capability: CAP_STORAGE_WRITE.to_string(),
            generation_id: None,
            message: Some(document.clone()),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        document
    }

    pub fn delete_preview_session(&mut self, id: &str) -> bool {
        let removed = self.preview_sessions.remove(id).is_some();
        if removed {
            self.emit(CoreEvent {
                kind: "preview.session.delete".to_string(),
                capability: CAP_STORAGE_WRITE.to_string(),
                generation_id: None,
                message: Some(id.to_string()),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
        }
        removed
    }

    pub fn start_soak_session(
        &mut self,
        id: &str,
        scenario: &str,
        process_state: &SupervisedProcessState,
    ) -> SoakSession {
        let session = SoakSession {
            id: id.to_string(),
            scenario: scenario.to_string(),
            status: "running".to_string(),
            started_at: now_iso(),
            updated_at: now_iso(),
            completed_at: None,
            failure_reason: None,
            sample_count: 0,
            healthy_samples: 0,
            degraded_samples: 0,
            unhealthy_samples: 0,
            restart_observed: false,
            stable_failover_observed: false,
            start_restart_count: process_state.restart_count,
            latest_restart_count: process_state.restart_count,
            current_phase: None,
            latest_sample: None,
            marks: Vec::new(),
            high_water: SoakHighWater::default(),
        };
        self.soak.current_session = Some(session.clone());
        self.emit(CoreEvent {
            kind: "process.soak.started".to_string(),
            capability: CAP_PROCESS_SOAK.to_string(),
            generation_id: None,
            message: Some(soak_session_to_json(&session)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        session
    }

    pub fn mark_soak_session(&mut self, session_id: &str, phase: &str, message: Option<&str>) -> Result<SoakSession, String> {
        let session = self
            .soak
            .current_session
            .as_mut()
            .filter(|entry| entry.id == session_id)
            .ok_or_else(|| "soak session not found".to_string())?;
        let mark = SoakMark {
            phase: phase.to_string(),
            message: message.map(|value| value.to_string()).filter(|value| !value.trim().is_empty()),
            marked_at: now_iso(),
        };
        session.current_phase = Some(mark.phase.clone());
        session.updated_at = mark.marked_at.clone();
        session.marks.push(mark.clone());
        let snapshot = session.clone();
        self.emit(CoreEvent {
            kind: "process.soak.mark".to_string(),
            capability: CAP_PROCESS_SOAK.to_string(),
            generation_id: None,
            message: Some(soak_mark_to_json(session_id, &mark)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        Ok(snapshot)
    }

    pub fn record_soak_sample(
        &mut self,
        session_id: &str,
        mut sample: SoakSample,
    ) -> Result<SoakSession, String> {
        let serving = self.serving_status();
        let session = self
            .soak
            .current_session
            .as_mut()
            .filter(|entry| entry.id == session_id)
            .ok_or_else(|| "soak session not found".to_string())?;
        sample.serving_requested_mode = serving.requested_mode.as_str().to_string();
        sample.serving_effective_mode = serving.effective_mode.as_str().to_string();
        sample.serving_reason = serving.reason.clone();
        sample.latest_generation_id = serving.latest_generation_id.clone();
        sample.latest_generation_state = serving.latest_generation_state.clone();
        sample.stable_failover =
            serving.requested_mode == ServingMode::Live && serving.effective_mode == ServingMode::Stable;
        sample.sequence = session.sample_count + 1;
        if sample.phase.is_none() {
            sample.phase = session.current_phase.clone();
        }
        session.sample_count = sample.sequence;
        session.updated_at = sample.sampled_at.clone();
        session.latest_restart_count = sample.restart_count;
        session.restart_observed = sample.restart_count > session.start_restart_count;
        session.stable_failover_observed = session.stable_failover_observed || sample.stable_failover;
        session.current_phase = sample.phase.clone().or_else(|| session.current_phase.clone());
        match sample.status.as_str() {
            "healthy" => session.healthy_samples += 1,
            "unhealthy" => session.unhealthy_samples += 1,
            _ => session.degraded_samples += 1,
        }
        session.high_water.absorb(&sample);
        session.latest_sample = Some(sample.clone());
        let snapshot = session.clone();
        self.emit(CoreEvent {
            kind: "process.soak.sample".to_string(),
            capability: CAP_PROCESS_SOAK.to_string(),
            generation_id: sample.latest_generation_id.clone(),
            message: Some(soak_sample_payload_to_json(session_id, &sample)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        Ok(snapshot)
    }

    pub fn complete_soak_session(&mut self, session_id: &str, message: Option<&str>) -> Result<SoakSession, String> {
        self.finish_soak_session(session_id, "completed", message)
    }

    pub fn fail_soak_session(&mut self, session_id: &str, message: Option<&str>) -> Result<SoakSession, String> {
        self.finish_soak_session(session_id, "failed", message)
    }

    fn finish_soak_session(&mut self, session_id: &str, status: &str, message: Option<&str>) -> Result<SoakSession, String> {
        let mut session = self
            .soak
            .current_session
            .clone()
            .filter(|entry| entry.id == session_id)
            .ok_or_else(|| "soak session not found".to_string())?;
        let completed_at = now_iso();
        session.status = status.to_string();
        session.updated_at = completed_at.clone();
        session.completed_at = Some(completed_at);
        if status == "failed" {
            session.failure_reason = message.map(|value| value.to_string()).filter(|value| !value.trim().is_empty());
        }
        let event_kind = if status == "failed" {
            "process.soak.failed"
        } else {
            "process.soak.completed"
        };
        self.soak.current_session = None;
        self.soak.last_session = Some(session.clone());
        self.emit(CoreEvent {
            kind: event_kind.to_string(),
            capability: CAP_PROCESS_SOAK.to_string(),
            generation_id: None,
            message: Some(soak_session_finish_to_json(&session, message)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        Ok(session)
    }

    pub fn emit(&mut self, event: CoreEvent) {
        let _ = self.store.append_event(&event);
        self.subscribers.retain(|sender| sender.send(event.clone()).is_ok());
    }

    fn replay_journal(&mut self) {
        let Ok(lines) = self.store.read_events() else {
            return;
        };
        for line in lines {
            let kind = extract_json_string(&line, "kind").unwrap_or_default();
            if kind.starts_with("serving.") {
                if let Some(requested_mode) = extract_json_string(&line, "requestedMode") {
                    self.serving.requested_mode = ServingMode::from_str(&requested_mode);
                }
                if let Some(updated_at) = extract_json_string(&line, "updatedAt") {
                    self.serving.updated_at = updated_at;
                }
                continue;
            }
            if kind == "preview.session.upsert" {
                if let Some(document) = extract_json_string_decoded(&line, "message") {
                    if let Some(id) = extract_json_string_decoded(&document, "id").or_else(|| extract_json_string(&document, "id")) {
                        self.preview_sessions.insert(id, document);
                    }
                }
                continue;
            }
            if kind == "preview.session.delete" {
                if let Some(id) = extract_json_string_decoded(&line, "message") {
                    self.preview_sessions.remove(&id);
                }
                continue;
            }
            if kind.starts_with("process.soak.") {
                self.replay_soak_event(&kind, &line);
                continue;
            }
            let Some(id) = extract_json_string(&line, "id") else {
                continue;
            };
            let generation = Generation {
                id: id.clone(),
                state: GenerationState::from_str(&extract_json_string(&line, "state").unwrap_or_else(|| "candidate".to_string())),
                content_hash: extract_json_string(&line, "contentHash").unwrap_or_default(),
                parent_id: extract_json_string(&line, "parentId"),
                created_at: extract_json_string(&line, "createdAt").unwrap_or_default(),
                source_paths: extract_json_string_array(&line, "sourcePaths"),
                compute_modules: extract_json_object_array(&line, "computeModules")
                    .into_iter()
                    .filter_map(|row| compute_module_build_record_from_json(&row))
                    .collect(),
                proofs: Vec::new(),
                correlation: Correlation::empty(),
                promotion_decision: extract_json_string(&line, "promotionDecision"),
            };
            self.generations.insert(id.clone(), generation.clone());
            if generation.state == GenerationState::GreenLocal {
                self.aliases.current_green_local = Some(id.clone());
            }
            if generation.state == GenerationState::Retired && self.aliases.current_green_local.as_deref() == Some(id.as_str()) {
                self.aliases.current_green_local = self
                    .generations()
                    .into_iter()
                    .filter(|entry| entry.state == GenerationState::GreenLocal)
                    .last()
                    .map(|entry| entry.id);
            }
            if generation.state == GenerationState::Stable || kind == "generation.promoted" || kind == "generation.rollback" {
                self.aliases.current_stable = Some(id.clone());
                self.aliases.last_good = Some(id);
            }
        }
    }

    fn latest_generation(&self) -> Option<Generation> {
        self.generations().into_iter().last()
    }

    fn effective_serving_mode(&self) -> ServingMode {
        if self.serving.requested_mode == ServingMode::Stable {
            return ServingMode::Stable;
        }
        match self.latest_generation().map(|generation| generation.state) {
            Some(GenerationState::CompileFailed | GenerationState::ProofFailed) => ServingMode::Stable,
            _ => ServingMode::Live,
        }
    }

    fn effective_serving_reason(&self) -> &'static str {
        if self.serving.requested_mode == ServingMode::Stable {
            return "requested-stable";
        }
        match self.latest_generation().map(|generation| generation.state) {
            Some(GenerationState::CompileFailed | GenerationState::ProofFailed) => "latest-failed",
            _ => "requested-live",
        }
    }

    fn build_serving_effective_change_event(&mut self, previous_effective_mode: ServingMode) -> Option<CoreEvent> {
        let next_effective_mode = self.effective_serving_mode();
        if next_effective_mode == previous_effective_mode {
            self.last_effective_serving_mode = next_effective_mode;
            return None;
        }
        self.last_effective_serving_mode = next_effective_mode;
        let status = self.serving_status();
        Some(CoreEvent {
            kind: "serving.effective.changed".to_string(),
            capability: CAP_NOTIFY_SURFACE.to_string(),
            generation_id: status.latest_generation_id.clone(),
            message: Some(format!(
                "effectiveMode={} reason={}",
                status.effective_mode.as_str(),
                status.reason
            )),
            generation: status
                .latest_generation_id
                .as_deref()
                .and_then(|id| self.generation(id)),
            serving: Some(self.serving.clone()),
            emitted_at: now_iso(),
        })
    }

    fn emit_serving_effective_change_if_needed(&mut self, previous_effective_mode: ServingMode) {
        if let Some(event) = self.build_serving_effective_change_event(previous_effective_mode) {
            self.emit(event);
        }
    }

    fn replay_soak_event(&mut self, kind: &str, line: &str) {
        let Some(message) = extract_json_string_decoded(line, "message") else {
            return;
        };
        match kind {
            "process.soak.started" => {
                if let Some(session) = soak_session_from_json(&message) {
                    self.soak.current_session = Some(session);
                }
            }
            "process.soak.mark" => {
                let session_id = extract_json_string(&message, "sessionId").unwrap_or_default();
                let Some(mark) = soak_mark_from_json(&message) else {
                    return;
                };
                if self.soak.current_session.as_ref().map(|entry| entry.id.as_str()) == Some(session_id.as_str()) {
                    if let Some(session) = self.soak.current_session.as_mut() {
                        session.current_phase = Some(mark.phase.clone());
                        session.updated_at = mark.marked_at.clone();
                        session.marks.push(mark);
                    }
                }
            }
            "process.soak.sample" => {
                let session_id = extract_json_string(&message, "sessionId").unwrap_or_default();
                let Some(sample) = soak_sample_from_json(&message) else {
                    return;
                };
                if self.soak.current_session.as_ref().map(|entry| entry.id.as_str()) == Some(session_id.as_str()) {
                    if let Some(session) = self.soak.current_session.as_mut() {
                        session.sample_count = sample.sequence;
                        session.updated_at = sample.sampled_at.clone();
                        session.latest_restart_count = sample.restart_count;
                        session.restart_observed = sample.restart_count > session.start_restart_count;
                        session.stable_failover_observed = session.stable_failover_observed || sample.stable_failover;
                        session.current_phase = sample.phase.clone().or_else(|| session.current_phase.clone());
                        match sample.status.as_str() {
                            "healthy" => session.healthy_samples += 1,
                            "unhealthy" => session.unhealthy_samples += 1,
                            _ => session.degraded_samples += 1,
                        }
                        session.high_water.absorb(&sample);
                        session.latest_sample = Some(sample);
                    }
                }
            }
            "process.soak.completed" | "process.soak.failed" => {
                let Some(id) = extract_json_string(&message, "id") else {
                    return;
                };
                let status = extract_json_string(&message, "status").unwrap_or_else(|| {
                    if kind.ends_with("failed") {
                        "failed".to_string()
                    } else {
                        "completed".to_string()
                    }
                });
                let updated_at = extract_json_string(&message, "updatedAt").unwrap_or_else(now_iso);
                let failure_reason = extract_json_string_decoded(&message, "message")
                    .or_else(|| extract_json_string(&message, "message"));
                let mut session = self
                    .soak
                    .current_session
                    .clone()
                    .filter(|entry| entry.id == id)
                    .or_else(|| soak_finished_session_from_json(&message))
                    .unwrap_or_else(|| SoakSession {
                        id,
                        scenario: "soak".to_string(),
                        status: status.clone(),
                        started_at: updated_at.clone(),
                        updated_at: updated_at.clone(),
                        completed_at: Some(updated_at.clone()),
                        failure_reason: if status == "failed" { failure_reason.clone() } else { None },
                        sample_count: 0,
                        healthy_samples: 0,
                        degraded_samples: 0,
                        unhealthy_samples: 0,
                        restart_observed: false,
                        stable_failover_observed: false,
                        start_restart_count: 0,
                        latest_restart_count: 0,
                        current_phase: None,
                        latest_sample: None,
                        marks: Vec::new(),
                        high_water: SoakHighWater::default(),
                    });
                session.status = status.clone();
                session.updated_at = updated_at.clone();
                session.completed_at = Some(updated_at);
                if status == "failed" {
                    session.failure_reason = failure_reason;
                }
                self.soak.current_session = None;
                self.soak.last_session = Some(session);
            }
            _ => {}
        }
    }
}

#[derive(Default)]
struct ComputeModuleHostState {
    output: Vec<u8>,
    logs: Vec<String>,
    metrics: Vec<String>,
}

#[derive(Clone)]
struct ComputeModuleRuntime {
    engine: WasmtimeEngine,
    cache: Arc<Mutex<BTreeMap<String, WasmtimeModule>>>,
}

#[derive(Clone, Debug)]
struct ComputeModuleShadowOutcome {
    status: String,
    reason: Option<String>,
    guest_result_json: Option<String>,
    generation_id: Option<String>,
    module_id: Option<String>,
    artifact_hash: Option<String>,
    store_path: Option<String>,
}

impl ComputeModuleRuntime {
    fn new() -> Result<Self, String> {
        let mut config = WasmtimeConfig::new();
        config.consume_fuel(true);
        let engine = WasmtimeEngine::new(&config)
            .map_err(|error| format!("wasmtime engine init failed: {}", error))?;
        Ok(Self {
            engine,
            cache: Arc::new(Mutex::new(BTreeMap::new())),
        })
    }
}

pub fn run_host(config_path: PathBuf, addr: String) -> std::io::Result<()> {
    let cwd = std::env::current_dir()?;
    let config = load_config(&config_path).unwrap_or_default();
    let compute_module_runtime = Arc::new(
        ComputeModuleRuntime::new().map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?
    );
    let store: Arc<dyn CoreStore> = Arc::new(FileStore::new(cwd.join(".witness-core")));
    let registry = Arc::new(Mutex::new(Registry::new(store)));
    let process_state = Arc::new(Mutex::new(SupervisedProcessState {
        command: config.supervise.command.clone(),
        working_dir: config.supervise.working_dir.clone(),
        restart_on_exit: config.supervise.restart_on_exit,
        restart_on_unhealthy: config.supervise.restart_on_unhealthy,
        health_url: config.supervise.health_url.clone(),
        reload_url: config.supervise.reload_url.clone(),
        public_addr: config.frontdoor.public_addr.clone(),
        frontdoor_enabled: config.frontdoor.public_addr.as_deref().is_some_and(|value| !value.trim().is_empty()),
        ..SupervisedProcessState::default()
    }));
    {
        let mut registry_guard = registry.lock().expect("registry lock");
        registry_guard.emit(CoreEvent::new("core.started", CAP_NOTIFY_SURFACE));
    }
    let watch_state = start_watcher(cwd.clone(), config.clone(), Arc::clone(&registry));
    if config.frontdoor.public_addr.as_deref().is_some_and(|value| !value.trim().is_empty()) {
        start_frontdoor_proxy(
            config.frontdoor.clone(),
            Arc::clone(&registry),
            Arc::clone(&process_state),
        );
        start_supervised_process_frontdoor(
            cwd.clone(),
            addr.clone(),
            config.clone(),
            Arc::clone(&registry),
            Arc::clone(&process_state),
        );
    } else {
        start_supervised_process(
            cwd.clone(),
            addr.clone(),
            config.supervise.clone(),
            Arc::clone(&registry),
            Arc::clone(&process_state),
        );
    }
    serve_http(addr, cwd, config, registry, process_state, watch_state, compute_module_runtime)
}

pub fn load_config(path: &Path) -> std::io::Result<CoreConfig> {
    let text = fs::read_to_string(path)?;
    Ok(parse_config(&text))
}

pub fn parse_config(text: &str) -> CoreConfig {
    let mut config = CoreConfig::default();
    let mut section = String::new();
    for raw_line in text.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line.trim_matches(&['[', ']'][..]).to_string();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        match (section.as_str(), key) {
            ("watch", "roots") => config.watch.roots = parse_string_array(value),
            ("watch", "ignore") => config.watch.ignore = parse_string_array(value),
            ("proof", "fast") => config.proof.fast = parse_string(value),
            ("proof", "full") => config.proof.full = Some(parse_string(value)),
            ("proof", "slow_ms") => config.proof.slow_ms = value.parse().unwrap_or(config.proof.slow_ms),
            ("package", "include") => config.package.include = parse_string_array(value),
            ("supervise", "command") => config.supervise.command = Some(parse_string(value)),
            ("supervise", "working_dir") => config.supervise.working_dir = Some(parse_string(value)),
            ("supervise", "reload_url") => config.supervise.reload_url = Some(parse_string(value)),
            ("supervise", "restart_on_exit") => {
                config.supervise.restart_on_exit = matches!(value.trim(), "true" | "1" | "\"true\"");
            }
            ("supervise", "restart_on_unhealthy") => {
                config.supervise.restart_on_unhealthy = matches!(value.trim(), "true" | "1" | "\"true\"");
            }
            ("supervise", "health_url") => config.supervise.health_url = Some(parse_string(value)),
            ("supervise", "health_interval_ms") => {
                config.supervise.health_interval_ms = value.parse().unwrap_or(config.supervise.health_interval_ms);
            }
            ("supervise", "health_timeout_ms") => {
                config.supervise.health_timeout_ms = value.parse().unwrap_or(config.supervise.health_timeout_ms);
            }
            ("supervise", "degraded_grace_polls") => {
                config.supervise.degraded_grace_polls = value.parse().unwrap_or(config.supervise.degraded_grace_polls);
            }
            ("supervise", "unhealthy_grace_polls") => {
                config.supervise.unhealthy_grace_polls = value.parse().unwrap_or(config.supervise.unhealthy_grace_polls);
            }
            ("frontdoor", "public_addr") => config.frontdoor.public_addr = Some(parse_string(value)),
            ("frontdoor", "drain_timeout_ms") => {
                config.frontdoor.drain_timeout_ms = value.parse().unwrap_or(config.frontdoor.drain_timeout_ms);
            }
            ("frontdoor", "startup_cutover_timeout_ms") => {
                config.frontdoor.startup_cutover_timeout_ms = value.parse().unwrap_or(config.frontdoor.startup_cutover_timeout_ms);
            }
            ("build_worker", "command") => config.build_worker.command = Some(parse_string(value)),
            ("build_worker", "working_dir") => config.build_worker.working_dir = Some(parse_string(value)),
            ("transaction", "build_timeout_ms") => {
                config.transaction.build_timeout_ms = value.parse().unwrap_or(config.transaction.build_timeout_ms);
            }
            ("transaction", "stage_root") => config.transaction.stage_root = parse_string(value),
            ("compute_modules", "engine") => config.compute_modules.engine = parse_string(value),
            ("compute_modules", "execution_mode") => {
                config.compute_modules.execution_mode = ComputeModuleExecutionMode::from_str(&parse_string(value));
            }
            ("compute_modules", "artifact_store_root") => {
                config.compute_modules.artifact_store_root = parse_string(value);
            }
            _ => {}
        }
    }
    config
}

fn start_watcher(cwd: PathBuf, config: CoreConfig, registry: Arc<Mutex<Registry>>) -> Arc<Mutex<WatcherState>> {
    let watch_state = Arc::new(Mutex::new(WatcherState {
        previous: fingerprint_files(&cwd, &config),
    }));
    let thread_state = Arc::clone(&watch_state);
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(1000));
            let current = fingerprint_files(&cwd, &config);
            let previous = thread_state.lock().expect("watch state lock").previous.clone();
            let changed = changed_paths(&previous, &current);
            if !changed.is_empty() {
                run_generation_pipeline(&cwd, &config, &changed, Arc::clone(&registry));
            }
            thread_state.lock().expect("watch state lock").previous = current;
        }
    });
    watch_state
}

fn refresh_watcher_baseline(cwd: &Path, config: &CoreConfig, watch_state: &Arc<Mutex<WatcherState>>) {
    let current = fingerprint_files(cwd, config);
    watch_state.lock().expect("watch state lock").previous = current;
}

fn run_generation_pipeline(cwd: &Path, config: &CoreConfig, changed: &[String], registry: Arc<Mutex<Registry>>) {
    let generation_id = next_generation_id();
    let parent_id = registry.lock().expect("registry lock").aliases().current_stable;
    let content_hash = format!("sha256:{}", sha256_hex(package_bytes(cwd, config)));
    let mut generation = Generation {
        id: generation_id,
        state: GenerationState::Candidate,
        content_hash,
        parent_id,
        created_at: now_iso(),
        source_paths: changed.to_vec(),
        compute_modules: Vec::new(),
        proofs: Vec::new(),
        correlation: Correlation::empty(),
        promotion_decision: None,
    };
    registry.lock().expect("registry lock").upsert_generation(generation.clone(), "generation.candidate", CAP_STORAGE_WRITE);
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "source.changed".to_string(),
        capability: CAP_STORAGE_READ.to_string(),
        generation_id: Some(generation.id.clone()),
        message: Some(changed.join(", ")),
        generation: Some(generation.clone()),
        serving: None,
        emitted_at: now_iso(),
    });

    generation.state = GenerationState::ProofRunning;
    generation.proofs.push(ProofRecord {
        name: "fast".to_string(),
        command: config.proof.fast.clone(),
        status: ProofStatus::Running,
        started_at: now_iso(),
        finished_at: None,
        duration_ms: None,
        exit_code: None,
    });
    registry.lock().expect("registry lock").upsert_generation(generation.clone(), "proof.started", CAP_PROOF_RUN);

    let proof = run_proof(cwd, "fast", &config.proof.fast, config.proof.slow_ms, generation.id.clone(), Arc::clone(&registry));
    generation.proofs = vec![proof.clone()];
    if proof.status == ProofStatus::Passed {
        generation.state = GenerationState::GreenLocal;
        registry.lock().expect("registry lock").upsert_generation(generation, "generation.green_local", CAP_STORAGE_WRITE);
    } else {
        generation.state = GenerationState::ProofFailed;
        registry.lock().expect("registry lock").upsert_generation(generation, "proof.failed", CAP_PROOF_RUN);
    }
}

fn run_proof(cwd: &Path, name: &str, command: &str, slow_ms: u64, generation_id: String, registry: Arc<Mutex<Registry>>) -> ProofRecord {
    let started = Instant::now();
    let started_at = now_iso();
    let mut record = ProofRecord {
        name: name.to_string(),
        command: command.to_string(),
        status: ProofStatus::Running,
        started_at,
        finished_at: None,
        duration_ms: None,
        exit_code: None,
    };
    let spawn_result = shell_command(command).current_dir(cwd).spawn();
    let Ok(mut child) = spawn_result else {
        record.status = ProofStatus::Failed;
        record.finished_at = Some(now_iso());
        record.duration_ms = Some(started.elapsed().as_millis());
        return record;
    };
    let mut slow_emitted = false;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                record.status = if status.success() { ProofStatus::Passed } else { ProofStatus::Failed };
                record.exit_code = status.code();
                record.finished_at = Some(now_iso());
                record.duration_ms = Some(started.elapsed().as_millis());
                let kind = if record.status == ProofStatus::Passed { "proof.passed" } else { "proof.failed" };
                registry.lock().expect("registry lock").emit(CoreEvent {
                    kind: kind.to_string(),
                    capability: CAP_PROOF_RUN.to_string(),
                    generation_id: Some(generation_id),
                    message: Some(format!("proof {name} {}", record.status.as_str())),
                    generation: None,
                    serving: None,
                    emitted_at: now_iso(),
                });
                return record;
            }
            Ok(None) => {
                if !slow_emitted && started.elapsed().as_millis() >= u128::from(slow_ms) {
                    slow_emitted = true;
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: "proof.slow".to_string(),
                        capability: CAP_PROOF_RUN.to_string(),
                        generation_id: Some(generation_id.clone()),
                        message: Some(format!("proof {name} exceeded {slow_ms}ms")),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                }
                thread::sleep(Duration::from_millis(200));
            }
            Err(_) => {
                record.status = ProofStatus::Failed;
                record.finished_at = Some(now_iso());
                record.duration_ms = Some(started.elapsed().as_millis());
                return record;
            }
        }
    }
}

fn serve_http(
    addr: String,
    cwd: PathBuf,
    config: CoreConfig,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
    watch_state: Arc<Mutex<WatcherState>>,
    compute_module_runtime: Arc<ComputeModuleRuntime>,
) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr)?;
    for stream in listener.incoming() {
        let Ok(stream) = stream else {
            continue;
        };
        let registry = Arc::clone(&registry);
        let process_state = Arc::clone(&process_state);
        let watch_state = Arc::clone(&watch_state);
        let compute_module_runtime = Arc::clone(&compute_module_runtime);
        let cwd = cwd.clone();
        let config = config.clone();
        thread::spawn(move || {
            let _ = handle_client(stream, &cwd, &config, registry, process_state, watch_state, compute_module_runtime);
        });
    }
    Ok(())
}

fn handle_client(
    mut stream: TcpStream,
    cwd: &Path,
    config: &CoreConfig,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
    watch_state: Arc<Mutex<WatcherState>>,
    compute_module_runtime: Arc<ComputeModuleRuntime>,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut first_line = String::new();
    reader.read_line(&mut first_line)?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("/");
    let (path, query) = raw_path.split_once('?').unwrap_or((raw_path, ""));
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body)?;
    }
    match (method, path) {
        ("GET", "/health") => {
            let state = process_state.lock().expect("process state lock").clone();
            let soak = registry.lock().expect("registry lock").soak_state();
            write_json(
                &mut stream,
                200,
                &format!(
                    "{{\"ok\":{},\"service\":\"witness-core\",\"process\":{},\"soak\":{}}}",
                    if state.status.as_deref() == Some("unhealthy") { "false" } else { "true" },
                    supervised_process_state_to_json(&state),
                    soak_state_to_json(&soak)
                ),
            )
        }
        ("GET", "/generations") => {
            let registry = registry.lock().expect("registry lock");
            write_json(&mut stream, 200, &registry_to_json(&registry))
        }
        ("GET", "/soak") => {
            let soak = registry.lock().expect("registry lock").soak_state();
            write_json(&mut stream, 200, &soak_state_to_json(&soak))
        }
        ("GET", "/serving") => {
            let registry = registry.lock().expect("registry lock");
            write_json(&mut stream, 200, &serving_status_to_json(&registry.serving_status()))
        }
        ("GET", "/processes") => {
            let state = process_state.lock().expect("process state lock").clone();
            let soak = registry.lock().expect("registry lock").soak_state();
            write_json(
                &mut stream,
                200,
                &format!(
                    "{{\"process\":{},\"soak\":{}}}",
                    supervised_process_state_to_json(&state),
                    soak_state_to_json(&soak)
                ),
            )
        }
        ("POST", "/processes/restart") => {
            let action = request_process_restart(Arc::clone(&registry), Arc::clone(&process_state));
            match action {
                Ok(state) => write_json(
                    &mut stream,
                    200,
                    &format!("{{\"ok\":true,\"process\":{}}}", supervised_process_state_to_json(&state)),
                ),
                Err(error) => write_json(&mut stream, 409, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/processes/stop") => {
            let action = request_process_stop(Arc::clone(&registry), Arc::clone(&process_state));
            match action {
                Ok(state) => write_json(
                    &mut stream,
                    200,
                    &format!("{{\"ok\":true,\"process\":{}}}", supervised_process_state_to_json(&state)),
                ),
                Err(error) => write_json(&mut stream, 409, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/serving/live") => {
            let status = registry.lock().expect("registry lock").request_serving_mode(ServingMode::Live);
            let changed_paths = {
                let registry_guard = registry.lock().expect("registry lock");
                registry_guard
                    .aliases()
                    .current_green_local
                    .as_deref()
                    .and_then(|id| registry_guard.generation(id))
                    .map(|generation| generation.source_paths)
                    .unwrap_or_default()
            };
            if !changed_paths.is_empty() {
                if let Err(error) = maybe_reload_serving_runtime(&process_state, &changed_paths, status.latest_generation_id.as_deref().unwrap_or(""), &registry) {
                    return write_json(
                        &mut stream,
                        502,
                        &format!("{{\"error\":{},\"serving\":{}}}", json_string(&error), serving_status_to_json(&status)),
                    );
                }
            }
            write_json(&mut stream, 200, &serving_status_to_json(&status))
        }
        ("POST", "/serving/stable") => {
            let status = registry.lock().expect("registry lock").request_serving_mode(ServingMode::Stable);
            write_json(&mut stream, 200, &serving_status_to_json(&status))
        }
        ("POST", "/transactions/published-authoring") => {
            let body_text = String::from_utf8_lossy(&body).to_string();
            match parse_published_authoring_request(&body_text) {
                Ok(request) => {
                    let source_path = request.edits.first().map(|edit| edit.path.clone());
                    match apply_published_authoring_transaction(cwd, config, &registry, &process_state, &watch_state, request) {
                        Ok(response) => write_json(&mut stream, 200, &response),
                        Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, source_path.as_deref())),
                    }
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, None)),
            }
        }
        ("POST", "/compute-modules/shadow-invoke") => {
            let body_text = String::from_utf8_lossy(&body).to_string();
            let host_operation = extract_json_string_decoded(&body_text, "hostOperation").unwrap_or_default();
            let input_json = extract_json_string_decoded(&body_text, "inputJson").unwrap_or_default();
            let js_result_json = extract_json_string_decoded(&body_text, "jsResultJson").unwrap_or_default();
            if host_operation.trim().is_empty() || input_json.trim().is_empty() || js_result_json.trim().is_empty() {
                write_json(&mut stream, 400, "{\"error\":\"hostOperation, inputJson, and jsResultJson are required\"}")
            } else {
                let outcome = shadow_invoke_compute_module(
                    cwd,
                    config,
                    &registry,
                    &compute_module_runtime,
                    &host_operation,
                    &input_json,
                    &js_result_json,
                );
                write_json(
                    &mut stream,
                    200,
                    &format!(
                        "{{\"ok\":true,\"status\":{},\"reason\":{},\"guestResultJson\":{},\"generationId\":{},\"moduleId\":{},\"artifactHash\":{},\"storePath\":{}}}",
                        json_string(&outcome.status),
                        json_optional_value(outcome.reason.as_deref()),
                        json_optional_value(outcome.guest_result_json.as_deref()),
                        json_optional_value(outcome.generation_id.as_deref()),
                        json_optional_value(outcome.module_id.as_deref()),
                        json_optional_value(outcome.artifact_hash.as_deref()),
                        json_optional_value(outcome.store_path.as_deref())
                    ),
                )
            }
        }
        ("GET", "/capabilities/fs/read") => {
            let params = parse_form_body(query);
            let correlation = capability_correlation_from_params(&params);
            let source_path = params.get("path").map(String::as_str).unwrap_or("");
            match capability_fs_read(cwd, config, source_path) {
                Ok(response) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: CAP_FS_READ.to_string(),
                        capability: CAP_FS_READ.to_string(),
                        generation_id: None,
                        message: Some(capability_event_message(&response.source_path, None, false, &correlation)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &source_content_to_json(&response))
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, if source_path.trim().is_empty() { None } else { Some(source_path) })),
            }
        }
        ("GET", "/capabilities/fs/stat") => {
            let params = parse_form_body(query);
            let correlation = capability_correlation_from_params(&params);
            let source_path = params.get("path").map(String::as_str).unwrap_or("");
            match capability_fs_stat(cwd, config, source_path) {
                Ok(response) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: CAP_FS_STAT.to_string(),
                        capability: CAP_FS_STAT.to_string(),
                        generation_id: None,
                        message: Some(capability_event_message(&response.source_path, None, false, &correlation)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &source_stat_to_json(&response))
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, if source_path.trim().is_empty() { None } else { Some(source_path) })),
            }
        }
        ("PUT", "/capabilities/fs/write") | ("POST", "/capabilities/fs/patch") => {
            let body_text = String::from_utf8_lossy(&body);
            let source_path = extract_json_string_decoded(&body_text, "path").unwrap_or_default();
            let content = extract_json_string_decoded(&body_text, "content").unwrap_or_default();
            let expected_hash = extract_json_string_decoded(&body_text, "expectedHash");
            let reason = extract_json_string_decoded(&body_text, "reason").unwrap_or_default();
            let preview_only = extract_json_bool(&body_text, "previewOnly");
            let correlation = Correlation {
                session_id: extract_json_string_decoded(&body_text, "sessionId"),
                surface_id: extract_json_string_decoded(&body_text, "surfaceId"),
                actor: extract_json_string_decoded(&body_text, "actor"),
            };
            let event_kind = if method == "PUT" { CAP_FS_WRITE } else { CAP_FS_PATCH };
            match capability_fs_write(cwd, config, &source_path, &content, preview_only, expected_hash.as_deref()) {
                Ok(response) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: event_kind.to_string(),
                        capability: event_kind.to_string(),
                        generation_id: None,
                        message: Some(capability_event_message(&response.source_path, Some(&reason), preview_only, &correlation)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &source_content_to_json(&response))
                }
                Err(error) => {
                    if !preview_only {
                        let kind = if error.status == 409 {
                            AUTHORING_WRITE_CONFLICT
                        } else {
                            AUTHORING_WRITE_REJECTED
                        };
                        let message = format!(
                            "{} error={} expectedHash={} actualHash={}",
                            capability_event_message(&source_path, Some(&reason), preview_only, &correlation),
                            error.message,
                            error.expected_hash.as_deref().unwrap_or("-"),
                            error.actual_hash.as_deref().unwrap_or("-"),
                        );
                        registry.lock().expect("registry lock").emit(CoreEvent {
                            kind: kind.to_string(),
                            capability: event_kind.to_string(),
                            generation_id: None,
                            message: Some(message),
                            generation: None,
                            serving: None,
                            emitted_at: now_iso(),
                        });
                    }
                    write_json(&mut stream, error.status, &capability_error_to_json(&error, if source_path.trim().is_empty() { None } else { Some(&source_path) }))
                }
            }
        }
        ("POST", "/capabilities/network/http-outbound") => {
            let body_text = String::from_utf8_lossy(&body).to_string();
            match handle_http_outbound_capability_request(&body_text) {
                Ok((response_body, outbound_method, outbound_url)) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: format!("{}.execute", CAP_NETWORK_HTTP_OUTBOUND),
                        capability: CAP_NETWORK_HTTP_OUTBOUND.to_string(),
                        generation_id: None,
                        message: Some(format!("method={} url={}", outbound_method, outbound_url)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &response_body)
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, extract_json_string_decoded(&body_text, "url").as_deref())),
            }
        }
        ("POST", "/capabilities/db/sqlite") => {
            let body_text = String::from_utf8_lossy(&body).to_string();
            match handle_sqlite_capability_request(cwd, &body_text) {
                Ok((response_body, operation, source_path)) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: format!("{}.{}", CAP_DB_SQLITE, operation),
                        capability: CAP_DB_SQLITE.to_string(),
                        generation_id: None,
                        message: Some(format!("operation={} path={}", operation, source_path)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &response_body)
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, extract_json_string_decoded(&body_text, "path").as_deref())),
            }
        }
        ("POST", "/verification-persistence") => {
            let body_text = String::from_utf8_lossy(&body).to_string();
            match handle_verification_persistence_request(cwd, &body_text) {
                Ok((response_body, operation)) => {
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: format!("verification.persistence.{}", operation),
                        capability: CAP_VERIFICATION_PERSISTENCE.to_string(),
                        generation_id: None,
                        message: Some(format!("operation={}", operation)),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    write_json(&mut stream, 200, &response_body)
                }
                Err(error) => write_json(&mut stream, error.status, &capability_error_to_json(&error, None)),
            }
        }
        ("POST", "/soak/start") => {
            let body_text = String::from_utf8_lossy(&body);
            let session_id = extract_json_string_decoded(&body_text, "id").unwrap_or_else(next_generation_id);
            let scenario = extract_json_string_decoded(&body_text, "scenario").unwrap_or_else(|| "soak".to_string());
            let state = process_state.lock().expect("process state lock").clone();
            let session = registry
                .lock()
                .expect("registry lock")
                .start_soak_session(&session_id, &scenario, &state);
            write_json(&mut stream, 200, &soak_session_to_json(&session))
        }
        ("POST", "/soak/mark") => {
            let body_text = String::from_utf8_lossy(&body);
            let session_id = extract_json_string_decoded(&body_text, "sessionId").unwrap_or_default();
            let phase = extract_json_string_decoded(&body_text, "phase").unwrap_or_default();
            let message = extract_json_string_decoded(&body_text, "message");
            if session_id.trim().is_empty() || phase.trim().is_empty() {
                return write_json(&mut stream, 400, "{\"error\":\"sessionId and phase are required\"}");
            }
            let result = registry
                .lock()
                .expect("registry lock")
                .mark_soak_session(&session_id, &phase, message.as_deref());
            match result {
                Ok(session) => write_json(&mut stream, 200, &soak_session_to_json(&session)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/soak/sample") => {
            let body_text = String::from_utf8_lossy(&body);
            let session_id = extract_json_string_decoded(&body_text, "sessionId").unwrap_or_default();
            if session_id.trim().is_empty() {
                return write_json(&mut stream, 400, "{\"error\":\"sessionId is required\"}");
            }
            let state = process_state.lock().expect("process state lock").clone();
            let mut sample = soak_sample_from_json(&body_text).unwrap_or_else(|| SoakSample {
                sequence: 0,
                phase: None,
                sampled_at: now_iso(),
                ready: false,
                status: "unknown".to_string(),
                reason_codes: Vec::new(),
                rss: 0,
                heap_used: 0,
                event_loop_p95_ms: 0,
                active_requests: 0,
                sse_clients: 0,
                preview_sessions: 0,
                snapshot_watchers: 0,
                fswatcher_resources: 0,
                timeout_resources: 0,
                process_running: state.running,
                process_ready: state.ready,
                pid: state.pid,
                restart_count: state.restart_count,
                serving_requested_mode: String::new(),
                serving_effective_mode: String::new(),
                serving_reason: String::new(),
                latest_generation_id: None,
                latest_generation_state: None,
                stable_failover: false,
            });
            sample.process_running = state.running;
            sample.process_ready = state.ready;
            sample.pid = state.pid;
            sample.restart_count = state.restart_count;
            let result = registry
                .lock()
                .expect("registry lock")
                .record_soak_sample(&session_id, sample);
            match result {
                Ok(session) => write_json(&mut stream, 200, &soak_session_to_json(&session)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/soak/complete") => {
            let body_text = String::from_utf8_lossy(&body);
            let session_id = extract_json_string_decoded(&body_text, "sessionId").unwrap_or_default();
            let message = extract_json_string_decoded(&body_text, "message");
            if session_id.trim().is_empty() {
                return write_json(&mut stream, 400, "{\"error\":\"sessionId is required\"}");
            }
            let result = registry
                .lock()
                .expect("registry lock")
                .complete_soak_session(&session_id, message.as_deref());
            match result {
                Ok(session) => write_json(&mut stream, 200, &soak_session_to_json(&session)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/soak/fail") => {
            let body_text = String::from_utf8_lossy(&body);
            let session_id = extract_json_string_decoded(&body_text, "sessionId").unwrap_or_default();
            let message = extract_json_string_decoded(&body_text, "message");
            if session_id.trim().is_empty() {
                return write_json(&mut stream, 400, "{\"error\":\"sessionId is required\"}");
            }
            let result = registry
                .lock()
                .expect("registry lock")
                .fail_soak_session(&session_id, message.as_deref());
            match result {
                Ok(session) => write_json(&mut stream, 200, &soak_session_to_json(&session)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", "/preview-sessions") => {
            let document = String::from_utf8_lossy(&body).trim().to_string();
            let Some(id) = extract_json_string_decoded(&document, "id").or_else(|| extract_json_string(&document, "id")) else {
                return write_json(&mut stream, 400, "{\"error\":\"preview session id is required\"}");
            };
            let stored = registry.lock().expect("registry lock").upsert_preview_session(&id, document);
            write_json(&mut stream, 200, &stored)
        }
        ("GET", p) if p.starts_with("/preview-sessions/") => {
            let id = p.trim_start_matches("/preview-sessions/").trim_matches('/');
            let session = registry.lock().expect("registry lock").preview_session(id);
            match session {
                Some(document) => write_json(&mut stream, 200, &document),
                None => write_json(&mut stream, 404, "{\"error\":\"preview session not found\"}"),
            }
        }
        ("PUT", p) if p.starts_with("/preview-sessions/") => {
            let id = p.trim_start_matches("/preview-sessions/").trim_matches('/');
            let document = String::from_utf8_lossy(&body).trim().to_string();
            let body_id = extract_json_string_decoded(&document, "id").or_else(|| extract_json_string(&document, "id"));
            if body_id.as_deref() != Some(id) {
                return write_json(&mut stream, 400, "{\"error\":\"preview session id mismatch\"}");
            }
            let stored = registry.lock().expect("registry lock").upsert_preview_session(id, document);
            write_json(&mut stream, 200, &stored)
        }
        ("DELETE", p) if p.starts_with("/preview-sessions/") => {
            let id = p.trim_start_matches("/preview-sessions/").trim_matches('/');
            let removed = registry.lock().expect("registry lock").delete_preview_session(id);
            if removed {
                write_json(&mut stream, 200, "{\"ok\":true}")
            } else {
                write_json(&mut stream, 404, "{\"error\":\"preview session not found\"}")
            }
        }
        ("POST", "/generations") => {
            let form = parse_form_body(String::from_utf8_lossy(&body).as_ref());
            let content_hash = form.get("contentHash").cloned().unwrap_or_default();
            if content_hash.trim().is_empty() {
                return write_json(&mut stream, 400, "{\"error\":\"contentHash is required\"}");
            }
            let generation = Generation {
                id: form
                    .get("id")
                    .filter(|value| !value.trim().is_empty())
                    .cloned()
                    .unwrap_or_else(next_generation_id),
                state: GenerationState::from_str(form.get("state").map(String::as_str).unwrap_or("candidate")),
                content_hash,
                parent_id: form.get("parentId").filter(|value| !value.trim().is_empty()).cloned(),
                created_at: now_iso(),
                source_paths: form
                    .get("sourcePaths")
                    .map(|value| parse_string_array(value))
                    .unwrap_or_default(),
                compute_modules: Vec::new(),
                proofs: Vec::new(),
                correlation: Correlation {
                    session_id: form.get("sessionId").filter(|value| !value.trim().is_empty()).cloned(),
                    surface_id: form.get("surfaceId").filter(|value| !value.trim().is_empty()).cloned(),
                    actor: form.get("actor").filter(|value| !value.trim().is_empty()).cloned(),
                },
                promotion_decision: form.get("promotionDecision").filter(|value| !value.trim().is_empty()).cloned(),
            };
            let event_kind = form
                .get("eventKind")
                .filter(|value| !value.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| generation_event_kind(&generation.state).to_string());
            registry
                .lock()
                .expect("registry lock")
                .upsert_generation(generation.clone(), &event_kind, CAP_STORAGE_WRITE);
            write_json(&mut stream, 200, &generation_to_json(&generation))
        }
        ("GET", "/events") => write_sse(stream, registry),
        ("POST", p) if p.starts_with("/generations/") && p.ends_with("/promote") => {
            let id = p.trim_start_matches("/generations/").trim_end_matches("/promote").trim_matches('/');
            let result = registry.lock().expect("registry lock").promote(id);
            match result {
                Ok(generation) => write_json(&mut stream, 200, &generation_to_json(&generation)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("POST", p) if p.starts_with("/generations/") && p.ends_with("/rollback") => {
            let id = p.trim_start_matches("/generations/").trim_end_matches("/rollback").trim_matches('/');
            let result = registry.lock().expect("registry lock").rollback(id);
            match result {
                Ok(generation) => write_json(&mut stream, 200, &generation_to_json(&generation)),
                Err(error) => write_json(&mut stream, 404, &format!("{{\"error\":{}}}", json_string(&error))),
            }
        }
        ("GET", p) if p.starts_with("/generations/") => {
            let id = p.trim_start_matches("/generations/").trim_matches('/');
            let generation = registry.lock().expect("registry lock").generation(id);
            match generation {
                Some(generation) => write_json(&mut stream, 200, &generation_to_json(&generation)),
                None => write_json(&mut stream, 404, "{\"error\":\"generation not found\"}"),
            }
        }
        _ => write_json(&mut stream, 404, "{\"error\":\"not found\"}"),
    }
}

fn process_health_probe_message(probe: &ProcessHealthProbe) -> String {
    let reasons = if probe.reason_codes.is_empty() {
        "none".to_string()
    } else {
        probe.reason_codes.join(",")
    };
    format!(
        "httpStatus={} status={} ready={} reasons={}",
        probe.http_status, probe.status, probe.ready, reasons
    )
}

fn apply_process_health_probe(
    process_state: &Arc<Mutex<SupervisedProcessState>>,
    probe: &ProcessHealthProbe,
) -> SupervisedProcessState {
    let mut state = process_state.lock().expect("process state lock");
    let previous_status = state.status.clone();
    let sampled_at = probe.sampled_at.clone().unwrap_or_else(now_iso);
    state.ready = probe.ready && probe.status != "unhealthy";
    state.last_health_status = Some(probe.status.clone());
    state.status = Some(probe.status.clone());
    state.reason_codes = probe.reason_codes.clone();
    state.last_health_sample_at = Some(sampled_at);
    match probe.status.as_str() {
        "healthy" => {
            state.degraded_streak = 0;
            state.unhealthy_streak = 0;
        }
        "degraded" => {
            state.degraded_streak = if previous_status.as_deref() == Some("degraded") {
                state.degraded_streak.saturating_add(1)
            } else {
                1
            };
            state.unhealthy_streak = 0;
        }
        "unhealthy" => {
            state.degraded_streak = if matches!(previous_status.as_deref(), Some("degraded") | Some("unhealthy")) {
                state.degraded_streak.saturating_add(1)
            } else {
                1
            };
            state.unhealthy_streak = if previous_status.as_deref() == Some("unhealthy") {
                state.unhealthy_streak.saturating_add(1)
            } else {
                1
            };
        }
        _ => {}
    }
    state.clone()
}

fn emit_process_health_events(
    registry: &Arc<Mutex<Registry>>,
    previous_status: Option<&str>,
    state: &SupervisedProcessState,
    probe: &ProcessHealthProbe,
) {
    let sample_message = process_health_probe_message(probe);
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "process.health.sample".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some(sample_message.clone()),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    if probe.status == "healthy" {
        if matches!(previous_status, Some("degraded") | Some("unhealthy")) {
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "process.health.recovered".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: None,
                message: Some(sample_message),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
        }
        return;
    }
    if probe.status == "degraded" && state.degraded_streak == 1 {
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: "process.degraded".to_string(),
            capability: CAP_NOTIFY_SURFACE.to_string(),
            generation_id: None,
            message: Some(sample_message),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        return;
    }
    if probe.status == "unhealthy" && previous_status != Some("unhealthy") {
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: "process.unhealthy".to_string(),
            capability: CAP_NOTIFY_SURFACE.to_string(),
            generation_id: None,
            message: Some(sample_message),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
    }
}

fn request_process_restart_with_reason(
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
    reason: &str,
) -> Result<SupervisedProcessState, String> {
    {
        let mut state = process_state.lock().expect("process state lock");
        if state.command.as_deref().unwrap_or("").trim().is_empty() {
            return Err("supervised process is not configured".to_string());
        }
        state.restart_on_exit = true;
        state.restart_requested = true;
        state.stop_requested = false;
        state.last_restart_reason = Some(reason.to_string());
    };
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "process.restart.requested".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some(reason.to_string()),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    Ok(process_state.lock().expect("process state lock").clone())
}

fn start_supervised_process(
    cwd: PathBuf,
    addr: String,
    config: SuperviseConfig,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) {
    let Some(command) = config.command.clone().filter(|value| !value.trim().is_empty()) else {
        return;
    };
    thread::spawn(move || {
        let working_dir = config
            .working_dir
            .clone()
            .filter(|value| !value.trim().is_empty())
            .map(|value| cwd.join(value))
            .unwrap_or_else(|| cwd.clone());
        let watchers_enabled = if config.reload_url.as_deref().is_some_and(|value| !value.trim().is_empty()) {
            "false"
        } else {
            "true"
        };
        loop {
            let should_start = {
                let state = process_state.lock().expect("process state lock");
                !state.running
                    && (state.last_started_at.is_none() || state.restart_requested || state.restart_on_exit)
            };
            if !should_start {
                thread::sleep(Duration::from_millis(200));
                continue;
            }

            {
                let mut state = process_state.lock().expect("process state lock");
                state.restart_requested = false;
                state.stop_requested = false;
                state.ready = false;
                state.last_health_status = None;
                state.status = None;
                state.reason_codes.clear();
                state.last_health_sample_at = None;
                state.degraded_streak = 0;
                state.unhealthy_streak = 0;
            }

            let instance_id = next_instance_id();
            let spawn_result = if let Some(mut direct) = supervised_command(&command) {
                direct
                    .current_dir(&working_dir)
                    .env("WITNESS_CORE_URL", format!("http://{}", addr))
                    .env("WITNESS_RUNTIME_INSTANCE_ID", &instance_id)
                    .env("WITNESS_RUNTIME_ROLE", "active")
                    .env("WITNESS_RUNTIME_MUTATIONS_ENABLED", "true")
                    .env("WITNESS_RUNTIME_WATCHERS_ENABLED", watchers_enabled)
                    .spawn()
            } else {
                Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "shell command required"))
            };
            let mut child = match spawn_result.or_else(|_| {
                shell_command(&command)
                    .current_dir(&working_dir)
                    .env("WITNESS_CORE_URL", format!("http://{}", addr))
                    .env("WITNESS_RUNTIME_INSTANCE_ID", &instance_id)
                    .env("WITNESS_RUNTIME_ROLE", "active")
                    .env("WITNESS_RUNTIME_MUTATIONS_ENABLED", "true")
                    .env("WITNESS_RUNTIME_WATCHERS_ENABLED", watchers_enabled)
                    .spawn()
            }) {
                Ok(child) => child,
                Err(error) => {
                    let message = format!("failed to spawn supervised process: {}", error);
                    {
                        let mut state = process_state.lock().expect("process state lock");
                        state.last_error = Some(message.clone());
                        state.last_exited_at = Some(now_iso());
                        state.running = false;
                        state.pid = None;
                        state.ready = false;
                    }
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: "process.failed".to_string(),
                        capability: CAP_NOTIFY_SURFACE.to_string(),
                        generation_id: None,
                        message: Some(message),
                        generation: None,
                        serving: None,
                        emitted_at: now_iso(),
                    });
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }
            };

            {
                let mut state = process_state.lock().expect("process state lock");
                state.command = Some(command.clone());
                state.working_dir = Some(normalize_path(&working_dir));
                state.restart_on_unhealthy = config.restart_on_unhealthy;
                state.running = true;
                state.pid = Some(child.id());
                state.last_started_at = Some(now_iso());
                state.last_error = None;
                state.ready = false;
                state.health_url = config.health_url.clone();
                state.reload_url = config.reload_url.clone();
                state.watchers_enabled = config.reload_url.as_deref().is_none_or(|value| value.trim().is_empty());
                state.instance_id = Some(instance_id.clone());
                state.role = Some("active".to_string());
            }
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "process.started".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: None,
                message: Some(format!("command={}", command)),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });

            if let Some(health_url) = config.health_url.as_deref().filter(|value| !value.trim().is_empty()) {
                let readiness = wait_for_process_readiness(
                    health_url,
                    config.health_interval_ms,
                    config.health_timeout_ms,
                );
                match readiness {
                    ProcessReadiness::Ready(status) => {
                        let ready_at = now_iso();
                        {
                            let mut state = process_state.lock().expect("process state lock");
                            state.ready = true;
                            state.last_ready_at = Some(ready_at);
                            state.last_health_status = Some("healthy".to_string());
                            state.status = Some("healthy".to_string());
                            state.last_error = None;
                        }
                        registry.lock().expect("registry lock").emit(CoreEvent {
                            kind: "process.ready".to_string(),
                            capability: CAP_NOTIFY_SURFACE.to_string(),
                            generation_id: None,
                            message: Some(format!("health_url={} status={}", health_url, status)),
                            generation: None,
                            serving: None,
                            emitted_at: now_iso(),
                        });
                    }
                    ProcessReadiness::Unhealthy(status) => {
                        {
                            let mut state = process_state.lock().expect("process state lock");
                            state.ready = false;
                            state.last_health_status = Some("unhealthy".to_string());
                            state.status = Some("unhealthy".to_string());
                            state.reason_codes = vec!["runtime_not_ready".to_string()];
                            state.last_error = Some(format!("process readiness failed: {}", status));
                        }
                        registry.lock().expect("registry lock").emit(CoreEvent {
                            kind: "process.unhealthy".to_string(),
                            capability: CAP_NOTIFY_SURFACE.to_string(),
                            generation_id: None,
                            message: Some(format!("health_url={} status={}", health_url, status)),
                            generation: None,
                            serving: None,
                            emitted_at: now_iso(),
                        });
                    }
                }
            }

            let health_interval = Duration::from_millis(config.health_interval_ms.max(25));
            let mut next_health_poll_at = Instant::now() + health_interval;
            let exit_status = loop {
                if let Some(health_url) = config.health_url.as_deref().filter(|value| !value.trim().is_empty()) {
                    if Instant::now() >= next_health_poll_at {
                        let previous_status = {
                            process_state.lock().expect("process state lock").status.clone()
                        };
                        let probe = match probe_process_health(health_url) {
                            Ok(probe) => probe,
                            Err(_error) => ProcessHealthProbe {
                                http_status: 503,
                                ready: false,
                                status: "unhealthy".to_string(),
                                reason_codes: vec!["health_probe_failed".to_string()],
                                sampled_at: Some(now_iso()),
                            },
                        };
                        let updated_state = apply_process_health_probe(&process_state, &probe);
                        emit_process_health_events(&registry, previous_status.as_deref(), &updated_state, &probe);
                        if probe.status == "degraded"
                            && updated_state.degraded_streak == config.degraded_grace_polls.max(1)
                        {
                            registry.lock().expect("registry lock").emit(CoreEvent {
                                kind: "process.degraded".to_string(),
                                capability: CAP_NOTIFY_SURFACE.to_string(),
                                generation_id: None,
                                message: Some(format!(
                                    "thresholdReached=true {}",
                                    process_health_probe_message(&probe)
                                )),
                                generation: None,
                                serving: None,
                                emitted_at: now_iso(),
                            });
                        }
                        if probe.status == "unhealthy"
                            && updated_state.unhealthy_streak >= config.unhealthy_grace_polls.max(1)
                            && updated_state.restart_requested == false
                            && updated_state.stop_requested == false
                        {
                            let reason = if probe.reason_codes.is_empty() {
                                "policy unhealthy".to_string()
                            } else {
                                format!("policy unhealthy: {}", probe.reason_codes.join(","))
                            };
                            let serving_status = registry.lock().expect("registry lock").request_serving_mode(ServingMode::Stable);
                            registry.lock().expect("registry lock").emit(CoreEvent {
                                kind: "process.restart.policy_triggered".to_string(),
                                capability: CAP_NOTIFY_SURFACE.to_string(),
                                generation_id: serving_status.latest_generation_id.clone(),
                                message: Some(reason.clone()),
                                generation: None,
                                serving: None,
                                emitted_at: now_iso(),
                            });
                            if config.restart_on_unhealthy {
                                let _ = request_process_restart_with_reason(
                                    Arc::clone(&registry),
                                    Arc::clone(&process_state),
                                    &reason,
                                );
                            }
                        }
                        next_health_poll_at = Instant::now() + health_interval;
                    }
                }
                let should_terminate = {
                    let state = process_state.lock().expect("process state lock");
                    state.stop_requested || state.restart_requested
                };
                if should_terminate {
                    let _ = child.kill();
                }
                match child.try_wait() {
                    Ok(Some(status)) => break Ok(status),
                    Ok(None) => thread::sleep(Duration::from_millis(100)),
                    Err(error) => break Err(error),
                }
            };
            let (exit_code, error_message) = match exit_status {
                Ok(status) => (status.code(), None),
                Err(error) => (None, Some(format!("process wait failed: {}", error))),
            };
            {
                let mut state = process_state.lock().expect("process state lock");
                state.running = false;
                state.pid = None;
                state.ready = false;
                state.last_exited_at = Some(now_iso());
                state.last_exit_code = exit_code;
                state.last_error = error_message.clone();
            }
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "process.exited".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: None,
                message: Some(match (exit_code, error_message.as_deref()) {
                    (_, Some(message)) => message.to_string(),
                    (Some(code), _) => format!("exit_code={}", code),
                    _ => "exit_code=unknown".to_string(),
                }),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });

            let should_restart = {
                let mut state = process_state.lock().expect("process state lock");
                let requested_stop = state.stop_requested;
                let requested_restart = state.restart_requested;
                if requested_stop {
                    state.stop_requested = false;
                    state.restart_requested = false;
                    false
                } else if requested_restart || state.restart_on_exit {
                    state.restart_count = state.restart_count.saturating_add(1);
                    state.restart_requested = false;
                    true
                } else {
                    false
                }
            };
            if should_restart {
                registry.lock().expect("registry lock").emit(CoreEvent {
                    kind: "process.restarting".to_string(),
                    capability: CAP_NOTIFY_SURFACE.to_string(),
                    generation_id: None,
                    message: Some(format!("command={}", command)),
                    generation: None,
                    serving: None,
                    emitted_at: now_iso(),
                });
                thread::sleep(Duration::from_millis(500));
            }
        }
    });
}

fn emit_instance_event(registry: &Arc<Mutex<Registry>>, kind: &str, snapshot: &ManagedProcessInstanceSnapshot, message: Option<String>) {
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: kind.to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some(message.unwrap_or_else(|| format!("instance={} state={}", snapshot.id, snapshot.state))),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
}

fn spawn_frontdoor_instance(
    cwd: &Path,
    control_addr: &str,
    config: &CoreConfig,
    role: &str,
    registry: &Arc<Mutex<Registry>>,
) -> Result<ManagedProcessInstance, String> {
    let command_template = config
        .supervise
        .command
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "supervised process is not configured".to_string())?;
    let port = reserve_loopback_port().ok_or_else(|| "failed to reserve runtime port".to_string())?;
    let instance_id = next_instance_id();
    let core_url = format!("http://{}", control_addr);
    let command = interpolate_runtime_template(&command_template, port, &instance_id, &core_url);
    let working_dir = config
        .supervise
        .working_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(|value| cwd.join(value))
        .unwrap_or_else(|| cwd.to_path_buf());
    let health_url = config
        .supervise
        .health_url
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(|value| interpolate_runtime_template(&value, port, &instance_id, &core_url));
    let reload_url = config
        .supervise
        .reload_url
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(|value| interpolate_runtime_template(&value, port, &instance_id, &core_url));
    let watchers_enabled = if reload_url.is_some() { "false" } else if role == "active" { "true" } else { "false" };
    let spawn_direct = || {
        if let Some(mut direct) = supervised_command(&command) {
            direct
                .current_dir(&working_dir)
                .env("WITNESS_CORE_URL", &core_url)
                .env("WITNESS_RUNTIME_PORT", port.to_string())
                .env("WITNESS_RUNTIME_INSTANCE_ID", &instance_id)
                .env("WITNESS_RUNTIME_ROLE", role)
                .env("WITNESS_RUNTIME_MUTATIONS_ENABLED", if role == "active" { "true" } else { "false" })
                .env("WITNESS_RUNTIME_WATCHERS_ENABLED", watchers_enabled)
                .spawn()
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "shell command required"))
        }
    };
    let child = spawn_direct().or_else(|_| {
        shell_command(&command)
            .current_dir(&working_dir)
            .env("WITNESS_CORE_URL", &core_url)
            .env("WITNESS_RUNTIME_PORT", port.to_string())
            .env("WITNESS_RUNTIME_INSTANCE_ID", &instance_id)
            .env("WITNESS_RUNTIME_ROLE", role)
            .env("WITNESS_RUNTIME_MUTATIONS_ENABLED", if role == "active" { "true" } else { "false" })
            .env("WITNESS_RUNTIME_WATCHERS_ENABLED", watchers_enabled)
            .spawn()
    })
    .map_err(|error| format!("failed to spawn supervised process: {}", error))?;
    let snapshot = ManagedProcessInstanceSnapshot {
        id: instance_id.clone(),
        state: if role == "active" { "starting".to_string() } else { "standby".to_string() },
        port,
        running: true,
        ready: false,
        pid: child.id(),
        last_started_at: now_iso(),
        last_exited_at: None,
        last_health_status: None,
        drain_started_at: None,
        drain_finished_at: None,
        role: role.to_string(),
    };
    emit_instance_event(
        registry,
        "process.instance.started",
        &snapshot,
        Some(format!("instance={} port={} role={} command={}", snapshot.id, port, role, command)),
    );
    let activation_url = health_url
        .as_deref()
        .and_then(|value| replace_http_url_path(value, "/api/runtime/supervision/activate"));
    let quiesce_url = health_url
        .as_deref()
        .and_then(|value| replace_http_url_path(value, "/api/runtime/supervision/quiesce"));
    Ok(ManagedProcessInstance {
        snapshot,
        child,
        health_url,
        activation_url,
        quiesce_url,
        reload_url,
        drain_deadline: None,
    })
}

fn wait_for_frontdoor_instance_ready(
    instance: &mut ManagedProcessInstance,
    config: &CoreConfig,
    registry: &Arc<Mutex<Registry>>,
) -> Result<(), String> {
    if let Some(health_url) = instance.health_url.as_deref().filter(|value| !value.trim().is_empty()) {
        match wait_for_process_readiness(
            health_url,
            config.supervise.health_interval_ms,
            config.frontdoor.startup_cutover_timeout_ms.max(config.supervise.health_timeout_ms),
        ) {
            ProcessReadiness::Ready(status) => {
                instance.snapshot.ready = true;
                instance.snapshot.last_health_status = Some("healthy".to_string());
                emit_instance_event(
                    registry,
                    "process.instance.ready",
                    &instance.snapshot,
                    Some(format!("instance={} status={}", instance.snapshot.id, status)),
                );
                Ok(())
            }
            ProcessReadiness::Unhealthy(status) => {
                instance.snapshot.last_health_status = Some("unhealthy".to_string());
                Err(format!("instance readiness failed: {}", status))
            }
        }
    } else {
        instance.snapshot.ready = true;
        instance.snapshot.last_health_status = Some("healthy".to_string());
        emit_instance_event(registry, "process.instance.ready", &instance.snapshot, None);
        Ok(())
    }
}

fn quiesce_frontdoor_instance(instance: &mut ManagedProcessInstance, registry: &Arc<Mutex<Registry>>) {
    if let Some(url) = instance.quiesce_url.as_deref() {
        let _ = issue_http_post(url);
    }
    instance.snapshot.state = "draining".to_string();
    instance.snapshot.role = "draining".to_string();
    instance.snapshot.drain_started_at = Some(now_iso());
    emit_instance_event(registry, "process.instance.quiesced", &instance.snapshot, None);
}

fn activate_frontdoor_instance(instance: &mut ManagedProcessInstance, registry: &Arc<Mutex<Registry>>) {
    if let Some(url) = instance.activation_url.as_deref() {
        let _ = issue_http_post(url);
    }
    instance.snapshot.state = "active".to_string();
    instance.snapshot.role = "active".to_string();
    instance.snapshot.ready = true;
    emit_instance_event(registry, "process.instance.activated", &instance.snapshot, None);
}

fn terminate_frontdoor_instance(instance: &mut ManagedProcessInstance) {
    let _ = instance.child.kill();
}

fn reconcile_frontdoor_exit(instance: &mut ManagedProcessInstance) -> Option<(Option<i32>, Option<String>)> {
    match instance.child.try_wait() {
        Ok(Some(status)) => {
            instance.snapshot.running = false;
            instance.snapshot.ready = false;
            instance.snapshot.last_exited_at = Some(now_iso());
            Some((status.code(), None))
        }
        Err(error) => {
            instance.snapshot.running = false;
            instance.snapshot.ready = false;
            instance.snapshot.last_exited_at = Some(now_iso());
            Some((None, Some(format!("process wait failed: {}", error))))
        }
        Ok(None) => None,
    }
}

fn start_supervised_process_frontdoor(
    cwd: PathBuf,
    addr: String,
    config: CoreConfig,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) {
    let Some(public_addr) = config.frontdoor.public_addr.clone().filter(|value| !value.trim().is_empty()) else {
        return;
    };
    thread::spawn(move || {
        let mut active: Option<ManagedProcessInstance> = None;
        let mut draining: Vec<ManagedProcessInstance> = Vec::new();
        loop {
            if process_state.lock().expect("process state lock").stop_requested && active.is_none() && draining.is_empty() {
                sync_frontdoor_state(&process_state, &public_addr, None, &draining);
                thread::sleep(Duration::from_millis(100));
                continue;
            }
            if active.is_none() {
                match spawn_frontdoor_instance(&cwd, &addr, &config, "active", &registry) {
                    Ok(mut instance) => {
                        let _ = wait_for_frontdoor_instance_ready(&mut instance, &config, &registry);
                        instance.snapshot.state = "active".to_string();
                        active = Some(instance);
                        sync_frontdoor_state(&process_state, &public_addr, active.as_ref(), &draining);
                    }
                    Err(error) => {
                        {
                            let mut state = process_state.lock().expect("process state lock");
                            state.last_error = Some(error.clone());
                        }
                        thread::sleep(Duration::from_millis(500));
                        continue;
                    }
                }
            }

            if let Some(active_instance) = active.as_mut() {
                if let Some(health_url) = active_instance.health_url.as_deref().filter(|value| !value.trim().is_empty()) {
                    let previous_status = process_state.lock().expect("process state lock").status.clone();
                    let probe = match probe_process_health(health_url) {
                        Ok(probe) => probe,
                        Err(_error) => ProcessHealthProbe {
                            http_status: 503,
                            ready: false,
                            status: "unhealthy".to_string(),
                            reason_codes: vec!["health_probe_failed".to_string()],
                            sampled_at: Some(now_iso()),
                        },
                    };
                    let updated_state = apply_process_health_probe(&process_state, &probe);
                    if probe.ready && probe.status != "unhealthy" {
                        active_instance.snapshot.ready = true;
                    }
                    active_instance.snapshot.last_health_status = updated_state.status.clone();
                    emit_process_health_events(&registry, previous_status.as_deref(), &updated_state, &probe);
                    if probe.status == "unhealthy"
                        && updated_state.unhealthy_streak >= config.supervise.unhealthy_grace_polls.max(1)
                        && config.supervise.restart_on_unhealthy
                        && !process_state.lock().expect("process state lock").restart_requested
                    {
                        let reason = if probe.reason_codes.is_empty() {
                            "policy unhealthy".to_string()
                        } else {
                            format!("policy unhealthy: {}", probe.reason_codes.join(","))
                        };
                        let serving_status = registry.lock().expect("registry lock").request_serving_mode(ServingMode::Stable);
                        registry.lock().expect("registry lock").emit(CoreEvent {
                            kind: "process.restart.policy_triggered".to_string(),
                            capability: CAP_NOTIFY_SURFACE.to_string(),
                            generation_id: serving_status.latest_generation_id.clone(),
                            message: Some(reason.clone()),
                            generation: None,
                            serving: None,
                            emitted_at: now_iso(),
                        });
                        let _ = request_process_restart_with_reason(Arc::clone(&registry), Arc::clone(&process_state), &reason);
                    }
                }
            }

            let (do_restart, stop_requested) = {
                let state = process_state.lock().expect("process state lock");
                (state.restart_requested, state.stop_requested)
            };
            if do_restart && active.is_some() {
                if let Ok(mut replacement) = spawn_frontdoor_instance(&cwd, &addr, &config, "standby", &registry) {
                    if wait_for_frontdoor_instance_ready(&mut replacement, &config, &registry).is_ok() {
                        activate_frontdoor_instance(&mut replacement, &registry);
                        if let Some(mut prior_active) = active.take() {
                            quiesce_frontdoor_instance(&mut prior_active, &registry);
                            prior_active.drain_deadline = Some(Instant::now() + Duration::from_millis(config.frontdoor.drain_timeout_ms.max(1)));
                            emit_instance_event(
                                &registry,
                                "process.instance.cutover",
                                &replacement.snapshot,
                                Some(format!("from={} to={}", prior_active.snapshot.id, replacement.snapshot.id)),
                            );
                            draining.push(prior_active);
                        }
                        {
                            let mut state = process_state.lock().expect("process state lock");
                            state.restart_requested = false;
                            state.restart_count = state.restart_count.saturating_add(1);
                        }
                        active = Some(replacement);
                    }
                }
            }
            if stop_requested {
                if let Some(active_instance) = active.as_mut() {
                    terminate_frontdoor_instance(active_instance);
                }
                for instance in &mut draining {
                    terminate_frontdoor_instance(instance);
                }
            }

            if let Some(active_instance) = active.as_mut() {
                if let Some((exit_code, error_message)) = reconcile_frontdoor_exit(active_instance) {
                    emit_instance_event(
                        &registry,
                        "process.instance.terminated",
                        &active_instance.snapshot,
                        Some(match (exit_code, error_message.as_deref()) {
                            (_, Some(message)) => message.to_string(),
                            (Some(code), _) => format!("exit_code={}", code),
                            _ => "exit_code=unknown".to_string(),
                        }),
                    );
                    active = None;
                }
            }
            let mut next_draining = Vec::new();
            for mut instance in draining.drain(..) {
                let inflight = inflight_connections_for(&process_state, &instance.snapshot.id);
                let deadline_reached = instance.drain_deadline.is_some_and(|deadline| Instant::now() >= deadline);
                if inflight == 0 || deadline_reached {
                    emit_instance_event(&registry, "process.instance.drained", &instance.snapshot, None);
                    terminate_frontdoor_instance(&mut instance);
                }
                if let Some((exit_code, error_message)) = reconcile_frontdoor_exit(&mut instance) {
                    emit_instance_event(
                        &registry,
                        "process.instance.terminated",
                        &instance.snapshot,
                        Some(match (exit_code, error_message.as_deref()) {
                            (_, Some(message)) => message.to_string(),
                            (Some(code), _) => format!("exit_code={}", code),
                            _ => "exit_code=unknown".to_string(),
                        }),
                    );
                } else {
                    next_draining.push(instance);
                }
            }
            draining = next_draining;
            sync_frontdoor_state(&process_state, &public_addr, active.as_ref(), &draining);
            thread::sleep(Duration::from_millis(100));
        }
    });
}

enum ProcessReadiness {
    Ready(String),
    Unhealthy(String),
}

#[derive(Clone, Debug)]
struct ProcessHealthProbe {
    http_status: u16,
    ready: bool,
    status: String,
    reason_codes: Vec<String>,
    sampled_at: Option<String>,
}

fn wait_for_process_readiness(health_url: &str, interval_ms: u64, timeout_ms: u64) -> ProcessReadiness {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(1));
    let interval = Duration::from_millis(interval_ms.max(25));
    let mut last_status = "not checked".to_string();
    while Instant::now() <= deadline {
        match probe_process_health(health_url) {
            Ok(probe) if (200..400).contains(&probe.http_status) && probe.ready && probe.status != "unhealthy" => {
                return ProcessReadiness::Ready(format!("{} {}", probe.http_status, probe.status));
            }
            Ok(probe) => {
                last_status = format!("{} {} ready={}", probe.http_status, probe.status, probe.ready);
            }
            Err(error) => {
                last_status = error;
            }
        }
        thread::sleep(interval);
    }
    ProcessReadiness::Unhealthy(last_status)
}

fn probe_process_health(health_url: &str) -> Result<ProcessHealthProbe, String> {
    let Some(target) = parse_http_url(health_url) else {
        return Err("unsupported health_url".to_string());
    };
    let address = target
        .address
        .to_socket_addrs()
        .map_err(|error| format!("invalid health address: {}", error))?
        .next()
        .ok_or_else(|| "invalid health address".to_string())?;
    let stream = TcpStream::connect_timeout(&address, Duration::from_millis(1_000));
    let mut stream = stream.map_err(|error| format!("connect failed: {}", error))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| format!("set read timeout failed: {}", error))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| format!("set write timeout failed: {}", error))?;
    write!(
        stream,
        "GET {} HTTP/1.1\r\nhost: {}\r\nconnection: close\r\n\r\n",
        target.path, target.host_header
    )
    .map_err(|error| format!("health write failed: {}", error))?;
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|error| format!("health read failed: {}", error))?;
    let http_status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "missing health status".to_string())?;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|error| format!("health header read failed: {}", error))?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
    }
    let mut body = String::new();
    reader
        .read_to_string(&mut body)
        .map_err(|error| format!("health body read failed: {}", error))?;
    let ready = extract_json_bool(&body, "ready");
    let status = extract_json_string(&body, "status").unwrap_or_else(|| {
        if (200..400).contains(&http_status) {
            "healthy".to_string()
        } else {
            "unhealthy".to_string()
        }
    });
    Ok(ProcessHealthProbe {
        http_status,
        ready: if body.trim().is_empty() {
            (200..400).contains(&http_status)
        } else {
            ready
        },
        status,
        reason_codes: extract_json_string_array(&body, "reasonCodes"),
        sampled_at: extract_json_string(&body, "sampledAt"),
    })
}

struct HttpHealthTarget {
    address: String,
    host_header: String,
    path: String,
}

fn parse_http_url(health_url: &str) -> Option<HttpHealthTarget> {
    let rest = health_url.strip_prefix("http://")?;
    let (authority, path) = match rest.split_once('/') {
        Some((authority, path)) => (authority, format!("/{}", path)),
        None => (rest, "/".to_string()),
    };
    if authority.trim().is_empty() {
        return None;
    }
    let address = if authority.contains(':') {
        authority.to_string()
    } else {
        format!("{}:80", authority)
    };
    Some(HttpHealthTarget {
        address,
        host_header: authority.to_string(),
        path,
    })
}

fn request_process_restart(
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> Result<SupervisedProcessState, String> {
    request_process_restart_with_reason(registry, process_state, "manual restart requested")
}

fn request_process_stop(
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> Result<SupervisedProcessState, String> {
    {
        let mut state = process_state.lock().expect("process state lock");
        if state.command.as_deref().unwrap_or("").trim().is_empty() {
            return Err("supervised process is not configured".to_string());
        }
        state.restart_on_exit = false;
        state.restart_requested = false;
        state.stop_requested = true;
    };
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "process.stop.requested".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some("manual stop requested".to_string()),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    Ok(process_state.lock().expect("process state lock").clone())
}

#[derive(Clone, Debug)]
struct ManagedProcessInstanceSnapshot {
    id: String,
    state: String,
    port: u16,
    running: bool,
    ready: bool,
    pid: u32,
    last_started_at: String,
    last_exited_at: Option<String>,
    last_health_status: Option<String>,
    drain_started_at: Option<String>,
    drain_finished_at: Option<String>,
    role: String,
}

struct ManagedProcessInstance {
    snapshot: ManagedProcessInstanceSnapshot,
    child: std::process::Child,
    health_url: Option<String>,
    activation_url: Option<String>,
    quiesce_url: Option<String>,
    reload_url: Option<String>,
    drain_deadline: Option<Instant>,
}

fn next_instance_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let value = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("runtime-{}", value)
}

fn reserve_loopback_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    drop(listener);
    Some(port)
}

fn interpolate_runtime_template(template: &str, runtime_port: u16, instance_id: &str, core_url: &str) -> String {
    template
        .replace("{runtime_port}", &runtime_port.to_string())
        .replace("{instance_id}", instance_id)
        .replace("{core_url}", core_url)
}

fn replace_http_url_path(url: &str, new_path: &str) -> Option<String> {
    let rest = url.strip_prefix("http://")?;
    let authority = rest.split_once('/').map(|(value, _)| value).unwrap_or(rest);
    Some(format!("http://{}{}", authority, new_path))
}

fn issue_http_post_with_body(url: &str, body: &str) -> Result<String, String> {
    let Some(target) = parse_http_url(url) else {
        return Err("unsupported control url".to_string());
    };
    let address = target
        .address
        .to_socket_addrs()
        .map_err(|error| format!("invalid control address: {}", error))?
        .next()
        .ok_or_else(|| "invalid control address".to_string())?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(1_000))
        .map_err(|error| format!("connect failed: {}", error))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(2_000)))
        .map_err(|error| format!("set read timeout failed: {}", error))?;
    let payload = body.as_bytes();
    write!(
        stream,
        "POST {} HTTP/1.1\r\nhost: {}\r\ncontent-length: {}\r\ncontent-type: application/json\r\nconnection: close\r\n\r\n{}",
        target.path, target.host_header, payload.len(), body
    )
    .map_err(|error| format!("control write failed: {}", error))?;
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|error| format!("control read failed: {}", error))?;
    let http_status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "missing control status".to_string())?;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|error| format!("control header read failed: {}", error))?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
    }
    let mut response_body = String::new();
    reader
        .read_to_string(&mut response_body)
        .map_err(|error| format!("control body read failed: {}", error))?;
    if (200..300).contains(&http_status) {
        Ok(response_body)
    } else {
        Err(format!("control request rejected: {}", http_status))
    }
}

fn issue_http_post(url: &str) -> Result<(), String> {
    issue_http_post_with_body(url, "{}").map(|_| ())
}

fn active_target_from_state(state: &SupervisedProcessState) -> Option<(String, String)> {
    let instance_id = state.frontdoor_active_instance_id.clone()?;
    let target = state.frontdoor_active_target.clone()?;
    Some((instance_id, target))
}

fn update_proxy_connection_count(process_state: &Arc<Mutex<SupervisedProcessState>>, instance_id: &str, delta: i64) {
    let mut state = process_state.lock().expect("process state lock");
    if let Some(instance) = state.instances.iter_mut().find(|entry| entry.id == instance_id) {
        if delta >= 0 {
            instance.inflight_connections = instance.inflight_connections.saturating_add(delta as u64);
        } else {
            instance.inflight_connections = instance.inflight_connections.saturating_sub((-delta) as u64);
            if instance.state == "draining" && instance.inflight_connections == 0 && instance.drain_finished_at.is_none() {
                instance.drain_finished_at = Some(now_iso());
            }
        }
    }
}

fn inflight_connections_for(process_state: &Arc<Mutex<SupervisedProcessState>>, instance_id: &str) -> u64 {
    process_state
        .lock()
        .expect("process state lock")
        .instances
        .iter()
        .find(|entry| entry.id == instance_id)
        .map(|entry| entry.inflight_connections)
        .unwrap_or(0)
}

fn sync_frontdoor_state(
    process_state: &Arc<Mutex<SupervisedProcessState>>,
    public_addr: &str,
    active: Option<&ManagedProcessInstance>,
    draining: &[ManagedProcessInstance],
) {
    let mut state = process_state.lock().expect("process state lock");
    let inflight_by_id = state
        .instances
        .iter()
        .map(|entry| (entry.id.clone(), entry.inflight_connections))
        .collect::<BTreeMap<_, _>>();
    let mut next_instances = Vec::new();
    if let Some(active_instance) = active {
        next_instances.push(SupervisedProcessInstanceState {
            id: active_instance.snapshot.id.clone(),
            state: active_instance.snapshot.state.clone(),
            port: Some(active_instance.snapshot.port),
            running: active_instance.snapshot.running,
            ready: active_instance.snapshot.ready,
            pid: Some(active_instance.snapshot.pid),
            inflight_connections: *inflight_by_id.get(&active_instance.snapshot.id).unwrap_or(&0),
            last_started_at: Some(active_instance.snapshot.last_started_at.clone()),
            last_exited_at: active_instance.snapshot.last_exited_at.clone(),
            last_health_status: active_instance.snapshot.last_health_status.clone(),
            drain_started_at: active_instance.snapshot.drain_started_at.clone(),
            drain_finished_at: active_instance.snapshot.drain_finished_at.clone(),
            role: Some(active_instance.snapshot.role.clone()),
        });
    }
    for instance in draining {
        next_instances.push(SupervisedProcessInstanceState {
            id: instance.snapshot.id.clone(),
            state: instance.snapshot.state.clone(),
            port: Some(instance.snapshot.port),
            running: instance.snapshot.running,
            ready: instance.snapshot.ready,
            pid: Some(instance.snapshot.pid),
            inflight_connections: *inflight_by_id.get(&instance.snapshot.id).unwrap_or(&0),
            last_started_at: Some(instance.snapshot.last_started_at.clone()),
            last_exited_at: instance.snapshot.last_exited_at.clone(),
            last_health_status: instance.snapshot.last_health_status.clone(),
            drain_started_at: instance.snapshot.drain_started_at.clone(),
            drain_finished_at: instance.snapshot.drain_finished_at.clone(),
            role: Some(instance.snapshot.role.clone()),
        });
    }
    state.frontdoor_enabled = true;
    state.public_addr = Some(public_addr.to_string());
    state.instances = next_instances;
    if let Some(active_instance) = active {
        state.running = active_instance.snapshot.running;
        state.pid = Some(active_instance.snapshot.pid);
        state.ready = active_instance.snapshot.ready;
        state.last_started_at = Some(active_instance.snapshot.last_started_at.clone());
        state.last_exited_at = active_instance.snapshot.last_exited_at.clone();
        state.last_health_status = active_instance.snapshot.last_health_status.clone();
        state.instance_id = Some(active_instance.snapshot.id.clone());
        state.role = Some(active_instance.snapshot.role.clone());
        state.watchers_enabled = active_instance.snapshot.role == "active" && active_instance.reload_url.is_none();
        state.mutations_enabled = active_instance.snapshot.role == "active";
        state.frontdoor_active_instance_id = if active_instance.snapshot.ready {
            Some(active_instance.snapshot.id.clone())
        } else {
            None
        };
        state.frontdoor_active_target = if active_instance.snapshot.ready {
            Some(format!("127.0.0.1:{}", active_instance.snapshot.port))
        } else {
            None
        };
        state.frontdoor_active_reload_url = if active_instance.snapshot.ready {
            active_instance.reload_url.clone()
        } else {
            None
        };
        state.status = active_instance.snapshot.last_health_status.clone();
    } else {
        state.running = false;
        state.pid = None;
        state.ready = false;
        state.instance_id = None;
        state.role = None;
        state.watchers_enabled = false;
        state.mutations_enabled = false;
        state.frontdoor_active_instance_id = None;
        state.frontdoor_active_target = None;
        state.frontdoor_active_reload_url = None;
    }
}

fn proxy_unavailable(mut stream: TcpStream) {
    let _ = write!(
        stream,
        "HTTP/1.1 503 Service Unavailable\r\ncontent-type: application/json\r\ncache-control: no-cache\r\nconnection: close\r\ncontent-length: 31\r\n\r\n{{\"error\":\"runtime unavailable\"}}"
    );
    let _ = stream.flush();
}

fn proxy_connection(stream: TcpStream, target: String, process_state: Arc<Mutex<SupervisedProcessState>>, instance_id: String) {
    let Ok(target_stream) = TcpStream::connect(target) else {
        update_proxy_connection_count(&process_state, &instance_id, -1);
        proxy_unavailable(stream);
        return;
    };
    let Ok(mut client_read) = stream.try_clone() else {
        update_proxy_connection_count(&process_state, &instance_id, -1);
        proxy_unavailable(stream);
        return;
    };
    let Ok(mut client_write) = stream.try_clone() else {
        update_proxy_connection_count(&process_state, &instance_id, -1);
        proxy_unavailable(stream);
        return;
    };
    let Ok(mut target_read) = target_stream.try_clone() else {
        update_proxy_connection_count(&process_state, &instance_id, -1);
        proxy_unavailable(stream);
        return;
    };
    let mut target_write = target_stream;
    let upload = thread::spawn(move || {
        let _ = std::io::copy(&mut client_read, &mut target_write);
    });
    let download = thread::spawn(move || {
        let _ = std::io::copy(&mut target_read, &mut client_write);
    });
    let _ = upload.join();
    let _ = download.join();
    update_proxy_connection_count(&process_state, &instance_id, -1);
}

fn start_frontdoor_proxy(
    config: FrontDoorConfig,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) {
    let Some(public_addr) = config.public_addr.clone().filter(|value| !value.trim().is_empty()) else {
        return;
    };
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(&public_addr) else {
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "process.instance.proxy_unavailable".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: None,
                message: Some(format!("frontdoor_bind_failed={}", public_addr)),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
            return;
        };
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: "process.instance.proxy_started".to_string(),
            capability: CAP_NOTIFY_SURFACE.to_string(),
            generation_id: None,
            message: Some(format!("public_addr={}", public_addr)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        for incoming in listener.incoming() {
            let Ok(stream) = incoming else {
                continue;
            };
            let Some((instance_id, target)) = active_target_from_state(&process_state.lock().expect("process state lock").clone()) else {
                proxy_unavailable(stream);
                continue;
            };
            update_proxy_connection_count(&process_state, &instance_id, 1);
            let state = Arc::clone(&process_state);
            thread::spawn(move || proxy_connection(stream, target, state, instance_id));
        }
    });
}

fn write_sse(mut stream: TcpStream, registry: Arc<Mutex<Registry>>) -> std::io::Result<()> {
    let receiver = registry.lock().expect("registry lock").subscribe();
    stream.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-cache\r\nconnection: keep-alive\r\naccess-control-allow-origin: *\r\n\r\n")?;
    stream.write_all(b"event: core.connected\ndata: {\"ok\":true}\n\n")?;
    stream.flush()?;
    while let Ok(event) = receiver.recv() {
        let frame = format!("event: {}\ndata: {}\n\n", event.kind, event.to_json());
        if stream.write_all(frame.as_bytes()).is_err() {
            break;
        }
        let _ = stream.flush();
    }
    Ok(())
}

fn write_json(stream: &mut TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    let status_text = if (200..300).contains(&status) { "OK" } else { "Error" };
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\ncontent-type: application/json; charset=utf-8\r\naccess-control-allow-origin: *\r\ncontent-length: {}\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(response.as_bytes())
}

#[derive(Clone, Debug)]
struct CapabilityPath {
    source_path: String,
    full_path: PathBuf,
}

#[derive(Clone, Debug)]
struct CapabilityError {
    status: u16,
    message: String,
    code: Option<String>,
    actual_hash: Option<String>,
    expected_hash: Option<String>,
    size: Option<u64>,
    modified_at: Option<String>,
    exists: Option<bool>,
}

#[derive(Clone, Debug)]
struct SourceContentResponse {
    source_path: String,
    content: String,
    hash: String,
    size: u64,
}

#[derive(Clone, Debug)]
struct SourceStatResponse {
    source_path: String,
    exists: bool,
    hash: Option<String>,
    size: Option<u64>,
    modified_at: Option<String>,
}

#[derive(Clone, Debug)]
struct OutboundHttpResponse {
    status: u16,
    headers: BTreeMap<String, String>,
    body_text: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OutboundHttpScheme {
    Http,
    Https,
}

struct OutboundHttpTarget {
    scheme: OutboundHttpScheme,
    address: String,
    host_header: String,
    path: String,
    url: String,
}

fn capability_error(status: u16, message: impl Into<String>) -> CapabilityError {
    CapabilityError {
        status,
        message: message.into(),
        code: None,
        actual_hash: None,
        expected_hash: None,
        size: None,
        modified_at: None,
        exists: None,
    }
}

fn file_snapshot(full_path: &Path) -> (bool, Option<String>, Option<u64>, Option<String>) {
    let Ok(metadata) = fs::metadata(full_path) else {
        return (false, None, None, None);
    };
    let bytes = fs::read(full_path).unwrap_or_default();
    (
        true,
        Some(format!("sha256:{}", sha256_hex(bytes))),
        Some(metadata.len()),
        metadata.modified().ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_millis().to_string()),
    )
}

fn capability_fs_read(cwd: &Path, config: &CoreConfig, source_path: &str) -> Result<SourceContentResponse, CapabilityError> {
    let resolved = resolve_capability_path(cwd, config, source_path)?;
    let bytes = fs::read(&resolved.full_path).map_err(|error| capability_error(404, format!("source read failed: {}", error)))?;
    let content = String::from_utf8(bytes.clone()).map_err(|error| capability_error(400, format!("source is not utf8: {}", error)))?;
    Ok(SourceContentResponse {
        source_path: resolved.source_path,
        content,
        hash: format!("sha256:{}", sha256_hex(bytes.clone())),
        size: bytes.len() as u64,
    })
}

fn capability_fs_stat(cwd: &Path, config: &CoreConfig, source_path: &str) -> Result<SourceStatResponse, CapabilityError> {
    let resolved = resolve_capability_path(cwd, config, source_path)?;
    let (exists, hash, size, modified_at) = file_snapshot(&resolved.full_path);
    Ok(SourceStatResponse {
        source_path: resolved.source_path,
        exists,
        hash,
        size,
        modified_at,
    })
}

fn capability_fs_write(
    cwd: &Path,
    config: &CoreConfig,
    source_path: &str,
    content: &str,
    preview_only: bool,
    expected_hash: Option<&str>,
) -> Result<SourceContentResponse, CapabilityError> {
    let resolved = resolve_capability_path(cwd, config, source_path)?;
    if !preview_only {
        let (exists, actual_hash, size, modified_at) = file_snapshot(&resolved.full_path);
        if let Some(expected_hash) = expected_hash.filter(|value| !value.trim().is_empty()) {
            if actual_hash.as_deref() != Some(expected_hash.trim()) {
                return Err(CapabilityError {
                    status: 409,
                    message: "source baseline hash mismatch".to_string(),
                    code: Some("WITNESS_CORE_SOURCE_CONFLICT".to_string()),
                    actual_hash,
                    expected_hash: Some(expected_hash.trim().to_string()),
                    size,
                    modified_at,
                    exists: Some(exists),
                });
            }
        }
        if let Some(parent) = resolved.full_path.parent() {
            if !parent.exists() {
                return Err(capability_error(404, "source parent directory does not exist"));
            }
        }
        fs::write(&resolved.full_path, content).map_err(|error| capability_error(500, format!("source write failed: {}", error)))?;
    }
    let bytes = content.as_bytes().to_vec();
    Ok(SourceContentResponse {
        source_path: resolved.source_path,
        content: content.to_string(),
        hash: format!("sha256:{}", sha256_hex(bytes.clone())),
        size: bytes.len() as u64,
    })
}

fn http_outbound_response_to_json(response: &OutboundHttpResponse) -> String {
    let headers = response.headers.iter()
        .map(|(name, value)| format!("{}:{}", json_string(name), json_string(value)))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"transport\":\"network\",\"status\":{},\"headers\":{{{}}},\"bodyText\":{}}}",
        response.status,
        headers,
        json_string(&response.body_text),
    )
}

fn extract_json_headers_map(body: &JsonValue, key: &str) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    let Some(object) = body.get(key).and_then(JsonValue::as_object) else {
        return headers;
    };
    for (name, value) in object {
        if name.trim().is_empty() {
            continue;
        }
        let header_value = match value {
            JsonValue::Null => String::new(),
            JsonValue::String(text) => text.clone(),
            JsonValue::Bool(flag) => flag.to_string(),
            JsonValue::Number(number) => number.to_string(),
            _ => value.to_string(),
        };
        headers.insert(name.trim().to_ascii_lowercase(), header_value);
    }
    headers
}

fn parse_outbound_http_url(url: &str) -> Option<OutboundHttpTarget> {
    let (scheme, default_port, rest) = if let Some(value) = url.strip_prefix("http://") {
        (OutboundHttpScheme::Http, 80u16, value)
    } else if let Some(value) = url.strip_prefix("https://") {
        (OutboundHttpScheme::Https, 443u16, value)
    } else {
        return None;
    };
    let authority_end = rest
        .find(|ch| matches!(ch, '/' | '?' | '#'))
        .unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.trim().is_empty() {
        return None;
    }
    let suffix = &rest[authority_end..];
    let path = if suffix.is_empty() {
        "/".to_string()
    } else if suffix.starts_with('/') {
        suffix.to_string()
    } else {
        format!("/{}", suffix)
    };
    let address = if authority.contains(':') {
        authority.to_string()
    } else {
        format!("{}:{}", authority, default_port)
    };
    Some(OutboundHttpTarget {
        scheme,
        address,
        host_header: authority.to_string(),
        path,
        url: url.to_string(),
    })
}

fn next_outbound_temp_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("{}_{}", millis, COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn outbound_temp_file(prefix: &str, suffix: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "witness-core-{}-{}{}",
        prefix,
        next_outbound_temp_id(),
        suffix
    ))
}

fn remove_outbound_temp_file(path: &Path) {
    let _ = fs::remove_file(path);
}

fn resolve_curl_command() -> Command {
    if let Ok(override_bin) = std::env::var("WITNESS_CORE_CURL_BIN") {
        let trimmed = override_bin.trim();
        if !trimmed.is_empty() {
            #[cfg(windows)]
            {
                let lower = trimmed.to_ascii_lowercase();
                if lower.ends_with(".cmd") || lower.ends_with(".bat") {
                    let mut command = Command::new("cmd");
                    command.arg("/C").arg(trimmed);
                    return command;
                }
            }
            return Command::new(trimmed);
        }
    }
    #[cfg(windows)]
    {
        Command::new("curl.exe")
    }
    #[cfg(not(windows))]
    {
        Command::new("curl")
    }
}

fn parse_curl_response_headers(header_text: &str) -> (Option<u16>, BTreeMap<String, String>) {
    let normalized = header_text.replace("\r\n", "\n");
    let mut current_status = None;
    let mut current_headers = BTreeMap::new();
    let mut last_status = None;
    let mut last_headers = BTreeMap::new();
    for raw_line in normalized.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.starts_with("HTTP/") {
            current_status = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u16>().ok());
            current_headers.clear();
            continue;
        }
        if line.is_empty() {
            if current_status.is_some() {
                last_status = current_status;
                last_headers = current_headers.clone();
            }
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            current_headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    if current_status.is_some() {
        last_status = current_status;
        last_headers = current_headers;
    }
    (last_status, last_headers)
}

fn execute_https_outbound_with_curl(
    target: &OutboundHttpTarget,
    method: &str,
    headers: &BTreeMap<String, String>,
    body_text: &str,
    timeout_ms: u64,
) -> Result<OutboundHttpResponse, CapabilityError> {
    let header_path = outbound_temp_file("curl-headers", ".txt");
    let body_path = outbound_temp_file("curl-body", ".bin");
    let request_body_path = if body_text.is_empty() {
        None
    } else {
        Some(outbound_temp_file("curl-request", ".bin"))
    };
    if let Some(path) = request_body_path.as_ref() {
        fs::write(path, body_text.as_bytes())
            .map_err(|error| capability_error(500, format!("outbound request staging failed: {}", error)))?;
    }
    let timeout_seconds = format!("{:.3}", (timeout_ms.max(100) as f64) / 1000.0);
    let mut command = resolve_curl_command();
    command
        .arg("--silent")
        .arg("--show-error")
        .arg("--globoff")
        .arg("--request")
        .arg(method)
        .arg("--connect-timeout")
        .arg(&timeout_seconds)
        .arg("--max-time")
        .arg(&timeout_seconds)
        .arg("--dump-header")
        .arg(&header_path)
        .arg("--output")
        .arg(&body_path)
        .arg("--write-out")
        .arg("%{http_code}")
        .arg("--url")
        .arg(&target.url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in headers {
        if matches!(name.as_str(), "host" | "content-length" | "connection") {
            continue;
        }
        command.arg("--header").arg(format!("{}: {}", name, value));
    }
    if let Some(path) = request_body_path.as_ref() {
        command.arg("--data-binary").arg(format!("@{}", path.display()));
    }
    let output = match command.output() {
        Ok(value) => value,
        Err(error) => {
            if let Some(path) = request_body_path.as_ref() {
                remove_outbound_temp_file(path);
            }
            remove_outbound_temp_file(&header_path);
            remove_outbound_temp_file(&body_path);
            return Err(capability_error(502, format!("outbound curl launch failed: {}", error)));
        }
    };
    let stderr_text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        if let Some(path) = request_body_path.as_ref() {
            remove_outbound_temp_file(path);
        }
        remove_outbound_temp_file(&header_path);
        remove_outbound_temp_file(&body_path);
        return Err(capability_error(
            502,
            if stderr_text.is_empty() {
                format!("outbound curl failed with status {}", output.status)
            } else {
                format!("outbound curl failed: {}", stderr_text)
            },
        ));
    }
    let stdout_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let header_text = fs::read_to_string(&header_path)
        .map_err(|error| capability_error(502, format!("outbound header read failed: {}", error)))?;
    let response_body = fs::read(&body_path)
        .map_err(|error| capability_error(502, format!("outbound body read failed: {}", error)))?;
    if let Some(path) = request_body_path.as_ref() {
        remove_outbound_temp_file(path);
    }
    remove_outbound_temp_file(&header_path);
    remove_outbound_temp_file(&body_path);
    let (header_status, response_headers) = parse_curl_response_headers(&header_text);
    let status = stdout_text
        .parse::<u16>()
        .ok()
        .or(header_status)
        .ok_or_else(|| capability_error(502, "missing outbound status"))?;
    Ok(OutboundHttpResponse {
        status,
        headers: response_headers,
        body_text: String::from_utf8_lossy(&response_body).to_string(),
    })
}

fn execute_http_outbound_over_tcp(
    target: &OutboundHttpTarget,
    method: &str,
    headers: &BTreeMap<String, String>,
    body_text: &str,
    timeout_ms: u64,
) -> Result<OutboundHttpResponse, CapabilityError> {
    let timeout = Duration::from_millis(timeout_ms.max(100));
    let address = target
        .address
        .to_socket_addrs()
        .map_err(|error| capability_error(400, format!("invalid outbound address: {}", error)))?
        .next()
        .ok_or_else(|| capability_error(400, "invalid outbound address"))?;
    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|error| capability_error(502, format!("outbound connect failed: {}", error)))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| capability_error(500, format!("outbound read timeout setup failed: {}", error)))?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|error| capability_error(500, format!("outbound write timeout setup failed: {}", error)))?;

    let payload = body_text.as_bytes();
    let mut request = format!(
        "{} {} HTTP/1.1\r\nhost: {}\r\ncontent-length: {}\r\nconnection: close\r\n",
        method,
        target.path,
        target.host_header,
        payload.len()
    );
    for (name, value) in headers {
        if matches!(name.as_str(), "host" | "content-length" | "connection") {
            continue;
        }
        request.push_str(&format!("{}: {}\r\n", name, value));
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|error| capability_error(502, format!("outbound request write failed: {}", error)))?;
    if !payload.is_empty() {
        stream
            .write_all(payload)
            .map_err(|error| capability_error(502, format!("outbound request body write failed: {}", error)))?;
    }
    stream
        .flush()
        .map_err(|error| capability_error(502, format!("outbound request flush failed: {}", error)))?;

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|error| capability_error(502, format!("outbound status read failed: {}", error)))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| capability_error(502, "missing outbound status"))?;
    let mut response_headers = BTreeMap::new();
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|error| capability_error(502, format!("outbound header read failed: {}", error)))?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            response_headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    let mut response_bytes = Vec::new();
    reader
        .read_to_end(&mut response_bytes)
        .map_err(|error| capability_error(502, format!("outbound body read failed: {}", error)))?;
    Ok(OutboundHttpResponse {
        status,
        headers: response_headers,
        body_text: String::from_utf8_lossy(&response_bytes).to_string(),
    })
}

fn execute_http_outbound_capability(
    url: &str,
    method: &str,
    headers: &BTreeMap<String, String>,
    body_text: &str,
    timeout_ms: u64,
) -> Result<OutboundHttpResponse, CapabilityError> {
    let normalized_method = method.trim().to_ascii_uppercase();
    if normalized_method.is_empty() || normalized_method.chars().any(|ch| ch.is_whitespace()) {
        return Err(capability_error(400, "http outbound method is required"));
    }
    let Some(target) = parse_outbound_http_url(url) else {
        return Err(capability_error(400, "unsupported outbound url; only http:// and https:// are currently supported"));
    };
    match target.scheme {
        OutboundHttpScheme::Http => execute_http_outbound_over_tcp(&target, &normalized_method, headers, body_text, timeout_ms),
        OutboundHttpScheme::Https => execute_https_outbound_with_curl(&target, &normalized_method, headers, body_text, timeout_ms),
    }
}

fn handle_http_outbound_capability_request(body_text: &str) -> Result<(String, String, String), CapabilityError> {
    let payload: JsonValue = serde_json::from_str(body_text)
        .map_err(|error| capability_error(400, format!("invalid outbound request json: {}", error)))?;
    let url = payload.get("url").and_then(JsonValue::as_str).unwrap_or("").trim().to_string();
    if url.is_empty() {
        return Err(capability_error(400, "outbound url is required"));
    }
    let method = payload.get("method").and_then(JsonValue::as_str).unwrap_or("GET").trim().to_string();
    let headers = extract_json_headers_map(&payload, "headers");
    let body_text_value = payload.get("bodyText").and_then(JsonValue::as_str).unwrap_or("").to_string();
    let timeout_ms = payload.get("timeoutMs").and_then(JsonValue::as_u64).unwrap_or(5_000);
    let response = execute_http_outbound_capability(&url, &method, &headers, &body_text_value, timeout_ms)?;
    Ok((http_outbound_response_to_json(&response), method, url))
}

#[derive(Clone, Debug)]
struct PublishedAuthoringEdit {
    path: String,
    content: String,
    expected_hash: Option<String>,
}

#[derive(Clone, Debug)]
struct PublishedAuthoringRequest {
    manifest_path: String,
    runtime_profile: String,
    edits: Vec<PublishedAuthoringEdit>,
    correlation: Correlation,
}

fn extract_json_array_slice<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{}\"", key);
    let key_index = text.find(&needle)?;
    let after_key = &text[key_index + needle.len()..];
    let colon_index = after_key.find(':')?;
    let after_colon = &after_key[colon_index + 1..];
    let array_start_relative = after_colon.find('[')?;
    let array_start = key_index + needle.len() + colon_index + 1 + array_start_relative;
    let bytes = text.as_bytes();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    for index in array_start..bytes.len() {
        let ch = bytes[index] as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&text[array_start..=index]);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_json_object_array(text: &str, key: &str) -> Vec<String> {
    let Some(array_text) = extract_json_array_slice(text, key) else {
        return Vec::new();
    };
    let mut results = Vec::new();
    let bytes = array_text.as_bytes();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    let mut object_start: Option<usize> = None;
    for index in 0..bytes.len() {
        let ch = bytes[index] as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => {
                if depth == 0 {
                    object_start = Some(index);
                }
                depth += 1;
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(start) = object_start.take() {
                        results.push(array_text[start..=index].to_string());
                    }
                }
            }
            _ => {}
        }
    }
    results
}

fn extract_json_value(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\"", key);
    let key_index = text.find(&needle)?;
    let after_key = &text[key_index + needle.len()..];
    let colon_index = after_key.find(':')?;
    let value_text = after_key[colon_index + 1..].trim_start();
    let bytes = value_text.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let first = bytes[0] as char;
    if first == '"' {
        let mut escaped = false;
        for index in 1..bytes.len() {
            let ch = bytes[index] as char;
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                return Some(value_text[..=index].to_string());
            }
        }
        return None;
    }
    if first == '{' || first == '[' {
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escaped = false;
        for index in 0..bytes.len() {
            let ch = bytes[index] as char;
            if in_string {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
                continue;
            }
            match ch {
                '"' => in_string = true,
                '{' | '[' => depth += 1,
                '}' | ']' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(value_text[..=index].to_string());
                    }
                }
                _ => {}
            }
        }
        return None;
    }
    let end = value_text.find(',').or_else(|| value_text.find('}')).unwrap_or(value_text.len());
    Some(value_text[..end].trim().to_string())
}

fn parse_published_authoring_request(body_text: &str) -> Result<PublishedAuthoringRequest, CapabilityError> {
    let manifest_path = extract_json_string_decoded(body_text, "manifestPath")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| capability_error(400, "manifestPath is required"))?;
    let edits = extract_json_object_array(body_text, "edits")
        .into_iter()
        .map(|row| {
            let path = extract_json_string_decoded(&row, "path")
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| capability_error(400, "each edit.path is required"))?;
            let content = extract_json_string_decoded(&row, "content")
                .ok_or_else(|| capability_error(400, format!("edit content is required for {}", path)))?;
            Ok(PublishedAuthoringEdit {
                path,
                content,
                expected_hash: extract_json_string_decoded(&row, "expectedHash").filter(|value| !value.trim().is_empty()),
            })
        })
        .collect::<Result<Vec<_>, CapabilityError>>()?;
    if edits.is_empty() {
        return Err(capability_error(400, "edits are required"));
    }
    Ok(PublishedAuthoringRequest {
        manifest_path,
        runtime_profile: extract_json_string_decoded(body_text, "runtimeProfile")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "authoring".to_string()),
        edits,
        correlation: Correlation {
            session_id: extract_json_string_decoded(body_text, "sessionId"),
            surface_id: extract_json_string_decoded(body_text, "surfaceId"),
            actor: extract_json_string_decoded(body_text, "actor"),
        },
    })
}

fn relative_under(root: &Path, target: &Path) -> Result<PathBuf, String> {
    target
        .strip_prefix(root)
        .map(|value| value.to_path_buf())
        .map_err(|_| "path is outside workspace root".to_string())
}

fn should_ignore_copy(path: &Path, config: &CoreConfig) -> bool {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
    config.watch.ignore.iter().any(|ignored| ignored.trim_matches('/').eq_ignore_ascii_case(name))
}

fn copy_workspace_tree(source: &Path, target: &Path, config: &CoreConfig) -> Result<(), String> {
    if should_ignore_copy(source, config) {
        return Ok(());
    }
    let metadata = fs::metadata(source).map_err(|error| format!("workspace stat failed: {}", error))?;
    if metadata.is_dir() {
        fs::create_dir_all(target).map_err(|error| format!("workspace copy mkdir failed: {}", error))?;
        for entry in fs::read_dir(source).map_err(|error| format!("workspace read_dir failed: {}", error))? {
            let entry = entry.map_err(|error| format!("workspace read_dir entry failed: {}", error))?;
            let child_source = entry.path();
            let child_target = target.join(entry.file_name());
            copy_workspace_tree(&child_source, &child_target, config)?;
        }
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("workspace copy parent mkdir failed: {}", error))?;
    }
    fs::copy(source, target).map_err(|error| format!("workspace copy failed: {}", error))?;
    Ok(())
}

fn stage_workspace_for_transaction(cwd: &Path, config: &CoreConfig, generation_id: &str) -> Result<PathBuf, String> {
    let stage_root = cwd.join(&config.transaction.stage_root).join(generation_id);
    if stage_root.exists() {
        let _ = fs::remove_dir_all(&stage_root);
    }
    fs::create_dir_all(&stage_root).map_err(|error| format!("transaction stage mkdir failed: {}", error))?;
    for entry in fs::read_dir(cwd).map_err(|error| format!("workspace root read failed: {}", error))? {
        let entry = entry.map_err(|error| format!("workspace root entry failed: {}", error))?;
        let source = entry.path();
        if source == cwd.join(".witness-core") {
            continue;
        }
        let target = stage_root.join(entry.file_name());
        copy_workspace_tree(&source, &target, config)?;
    }
    Ok(stage_root)
}

fn interpolate_transaction_template(template: &str, manifest_path: &str, workspace_root: &str, runtime_profile: &str) -> String {
    template
        .replace("{manifest_path}", manifest_path)
        .replace("{workspace_root}", workspace_root)
        .replace("{runtime_profile}", runtime_profile)
}

fn parse_build_worker_result(text: &str) -> BuildWorkerResult {
    let compute_modules = extract_json_object_array(text, "computeModules")
        .into_iter()
        .filter_map(|row| compute_module_build_record_from_json(&row))
        .collect::<Vec<_>>();
    let error = extract_json_string_decoded(text, "error").or_else(|| extract_json_string(text, "error"));
    let raw_message = if !text.trim().is_empty() {
        text.trim().to_string()
    } else {
        error.clone().unwrap_or_else(|| "build worker failed".to_string())
    };
    BuildWorkerResult {
        error,
        compute_module_count: extract_json_u64(text, "computeModuleCount")
            .map(|value| value as usize)
            .unwrap_or(compute_modules.len()),
        compute_modules,
        raw_message,
    }
}

fn compute_module_event_message(record: &ComputeModuleBuildRecord) -> String {
    compute_module_build_record_to_json(record)
}

fn emit_compute_module_build_events(
    registry: &Arc<Mutex<Registry>>,
    generation_id: &str,
    build_result: &BuildWorkerResult,
) {
    if build_result.compute_module_count == 0 && build_result.compute_modules.is_empty() {
        return;
    }
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "transaction.compute_module.compile.started".to_string(),
        capability: CAP_PROOF_RUN.to_string(),
        generation_id: Some(generation_id.to_string()),
        message: Some(format!("count={}", build_result.compute_module_count)),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    for record in &build_result.compute_modules {
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: if record.success {
                "transaction.compute_module.compile.passed".to_string()
            } else {
                "transaction.compute_module.compile.failed".to_string()
            },
            capability: CAP_PROOF_RUN.to_string(),
            generation_id: Some(generation_id.to_string()),
            message: Some(compute_module_event_message(record)),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        if record.success {
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "transaction.compute_module.artifact.emitted".to_string(),
                capability: CAP_PROOF_RUN.to_string(),
                generation_id: Some(generation_id.to_string()),
                message: Some(compute_module_event_message(record)),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
        }
    }
}

fn run_build_worker(
    cwd: &Path,
    config: &CoreConfig,
    stage_root: &Path,
    manifest_path: &str,
    runtime_profile: &str,
    generation_id: &str,
    registry: &Arc<Mutex<Registry>>,
) -> Result<BuildWorkerResult, BuildWorkerResult> {
    let command_template = config
        .build_worker
        .command
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| BuildWorkerResult {
            error: Some("build worker is not configured".to_string()),
            compute_module_count: 0,
            compute_modules: Vec::new(),
            raw_message: "build worker is not configured".to_string(),
        })?;
    let command = interpolate_transaction_template(
        &command_template,
        manifest_path,
        &normalize_path(stage_root),
        runtime_profile,
    );
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "transaction.build.started".to_string(),
        capability: CAP_PROOF_RUN.to_string(),
        generation_id: Some(generation_id.to_string()),
        message: Some(command.clone()),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    let working_dir = config
        .build_worker
        .working_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(|value| cwd.join(value))
        .unwrap_or_else(|| cwd.to_path_buf());
    let spawn = |mut cmd: Command| {
        cmd.current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| format!("build worker spawn failed: {}", error))
    };
    let output = match if let Some(direct) = supervised_command(&command) {
        spawn(direct)
    } else {
        Err("shell command required".to_string())
    }
    .or_else(|_| spawn(shell_command(&command))) {
        Ok(output) => output,
        Err(error) => {
            return Err(BuildWorkerResult {
                error: Some(error.clone()),
                compute_module_count: 0,
                compute_modules: Vec::new(),
                raw_message: error,
            });
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let selected_text = if !stdout.is_empty() {
        stdout.as_str()
    } else if !stderr.is_empty() {
        stderr.as_str()
    } else {
        ""
    };
    let mut build_result = parse_build_worker_result(selected_text);
    if build_result.raw_message.trim().is_empty() {
        build_result.raw_message = if !stderr.is_empty() {
            stderr.clone()
        } else if !stdout.is_empty() {
            stdout.clone()
        } else {
            "build worker failed".to_string()
        };
    }
    emit_compute_module_build_events(registry, generation_id, &build_result);
    if output.status.success() {
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: "transaction.build.passed".to_string(),
            capability: CAP_PROOF_RUN.to_string(),
            generation_id: Some(generation_id.to_string()),
            message: Some(if stdout.is_empty() { "ok".to_string() } else { stdout.clone() }),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        Ok(build_result)
    } else {
        let message = if let Some(error) = build_result.error.clone() {
            error
        } else if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "build worker failed".to_string()
        };
        build_result.error = Some(message.clone());
        build_result.raw_message = message.clone();
        registry.lock().expect("registry lock").emit(CoreEvent {
            kind: "transaction.build.failed".to_string(),
            capability: CAP_PROOF_RUN.to_string(),
            generation_id: Some(generation_id.to_string()),
            message: Some(message.clone()),
            generation: None,
            serving: None,
            emitted_at: now_iso(),
        });
        Err(build_result)
    }
}

fn normalize_workspace_relative_path(root: &Path, path: &Path) -> String {
    relative_under(root, path)
        .map(|value| normalize_path(&value))
        .unwrap_or_else(|_| normalize_path(path))
}

fn compute_module_artifact_store_path(
    cwd: &Path,
    config: &CoreConfig,
    artifact_hash: &str,
) -> Result<PathBuf, String> {
    let hash = artifact_hash.trim().strip_prefix("sha256:").unwrap_or(artifact_hash.trim());
    if hash.is_empty() || hash.chars().any(|ch| !ch.is_ascii_hexdigit()) {
        return Err(format!("invalid compute module artifact hash: {}", artifact_hash));
    }
    Ok(cwd
        .join(&config.compute_modules.artifact_store_root)
        .join(format!("{}.wasm", hash.to_ascii_lowercase())))
}

fn store_compute_module_artifacts(
    cwd: &Path,
    stage_root: &Path,
    config: &CoreConfig,
    records: &[ComputeModuleBuildRecord],
) -> Result<Vec<ComputeModuleBuildRecord>, String> {
    let mut stored = Vec::with_capacity(records.len());
    for record in records {
        if !record.success {
            stored.push(record.clone());
            continue;
        }
        let artifact_hash = record
            .artifact_hash
            .as_deref()
            .ok_or_else(|| format!("compute module {} missing artifactHash", record.id))?;
        let artifact_path = record
            .artifact_path
            .as_deref()
            .ok_or_else(|| format!("compute module {} missing artifactPath", record.id))?;
        let source_path = stage_root.join(artifact_path);
        if !source_path.exists() {
            return Err(format!(
                "staged compute module artifact not found for {}: {}",
                record.id,
                normalize_path(&source_path)
            ));
        }
        let store_path = compute_module_artifact_store_path(cwd, config, artifact_hash)?;
        if let Some(parent) = store_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("compute module artifact store mkdir failed: {}", error))?;
        }
        if !store_path.exists() {
            fs::copy(&source_path, &store_path)
                .map_err(|error| format!("compute module artifact store copy failed: {}", error))?;
        }
        let mut stored_record = record.clone();
        stored_record.store_path = Some(normalize_workspace_relative_path(cwd, &store_path));
        stored.push(stored_record);
    }
    Ok(stored)
}

fn active_generation_for_compute_modules(registry: &Registry) -> Option<Generation> {
    match registry.effective_serving_mode() {
        ServingMode::Stable => registry
            .aliases
            .current_stable
            .as_deref()
            .and_then(|id| registry.generation(id)),
        ServingMode::Live => registry
            .aliases
            .current_green_local
            .as_deref()
            .and_then(|id| registry.generation(id))
            .or_else(|| {
                registry
                    .aliases
                    .current_stable
                    .as_deref()
                    .and_then(|id| registry.generation(id))
            }),
    }
}

fn guest_output_to_js_response(output_json: &str) -> Result<String, String> {
    let status = extract_json_string(output_json, "status")
        .ok_or_else(|| "guest output missing status".to_string())?;
    match status.as_str() {
        "success" => {
            let payload = extract_json_value(output_json, "payload")
                .ok_or_else(|| "guest success output missing payload".to_string())?;
            Ok(format!("{{\"status\":\"success\",\"payload\":{}}}", payload))
        }
        "error" => {
            let error = extract_json_value(output_json, "error")
                .ok_or_else(|| "guest error output missing error object".to_string())?;
            Ok(format!("{{\"status\":\"failure\",\"payload\":{}}}", error))
        }
        other => Err(format!("guest output has unsupported status {}", other)),
    }
}

fn compute_module_shadow_message(outcome: &ComputeModuleShadowOutcome) -> String {
    format!(
        "{{{},{},{},{},{},{},{}}}",
        json_pair("status", &outcome.status),
        json_optional_pair("reason", outcome.reason.as_deref()),
        json_optional_pair("guestResultJson", outcome.guest_result_json.as_deref()),
        json_optional_pair("generationId", outcome.generation_id.as_deref()),
        json_optional_pair("moduleId", outcome.module_id.as_deref()),
        json_optional_pair("artifactHash", outcome.artifact_hash.as_deref()),
        json_optional_pair("storePath", outcome.store_path.as_deref())
    )
}

fn emit_compute_module_shadow_event(
    registry: &Arc<Mutex<Registry>>,
    kind: &str,
    generation_id: Option<&str>,
    outcome: &ComputeModuleShadowOutcome,
) {
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: kind.to_string(),
        capability: CAP_COMPUTE_EXECUTE.to_string(),
        generation_id: generation_id.map(|value| value.to_string()),
        message: Some(compute_module_shadow_message(outcome)),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
}

fn read_memory_bytes(caller: &mut Caller<'_, ComputeModuleHostState>, ptr: i32, len: i32) -> Vec<u8> {
    if ptr < 0 || len < 0 {
        return Vec::new();
    }
    let Some(Extern::Memory(memory)) = caller.get_export("memory") else {
        return Vec::new();
    };
    let data = memory.data(&caller);
    let start = ptr as usize;
    let end = start.saturating_add(len as usize);
    if end > data.len() {
        return Vec::new();
    }
    data[start..end].to_vec()
}

fn validate_compute_module_runtime(module: &WasmtimeModule, record: &ComputeModuleBuildRecord) -> Result<(), String> {
    let mut exports = BTreeSet::new();
    let mut has_memory = false;
    let mut has_invoke = false;
    for export in module.exports() {
        exports.insert(export.name().to_string());
        match export.ty() {
            ExternType::Memory(_) if export.name() == "memory" => {
                has_memory = true;
            }
            ExternType::Func(function) if export.name() == record.export_name => {
                let params = function.params().collect::<Vec<_>>();
                let results = function.results().collect::<Vec<_>>();
                has_invoke = matches!(params.as_slice(), [ValType::I32, ValType::I32])
                    && matches!(results.as_slice(), [ValType::I32]);
            }
            _ => {}
        }
    }
    if !has_memory {
        return Err(format!("compute module {} is missing required memory export", record.id));
    }
    if !has_invoke {
        return Err(format!(
            "compute module {} is missing required {}(i32, i32) -> i32 export",
            record.id, record.export_name
        ));
    }
    let mut imported_functions = BTreeSet::new();
    for import in module.imports() {
        if import.module() != COMPUTE_MODULE_IMPORT_NAMESPACE_V1 {
            return Err(format!(
                "compute module {} imports unsupported module {}",
                record.id,
                import.module()
            ));
        }
        let name = import.name();
        match import.ty() {
            ExternType::Func(_) => {}
            _ => {
                return Err(format!(
                    "compute module {} import {} must be a function",
                    record.id, name
                ));
            }
        }
        match name {
            "output" => {
                imported_functions.insert("output".to_string());
            }
            "log" => {
                if !record.allowed_bindings.iter().any(|binding| binding == "host.log") {
                    return Err(format!("compute module {} imports host.log without permission", record.id));
                }
                imported_functions.insert("log".to_string());
            }
            "metric" => {
                if !record.allowed_bindings.iter().any(|binding| binding == "host.metric") {
                    return Err(format!("compute module {} imports host.metric without permission", record.id));
                }
                imported_functions.insert("metric".to_string());
            }
            other => {
                return Err(format!(
                    "compute module {} imports unsupported binding {}",
                    record.id, other
                ));
            }
        }
    }
    if !imported_functions.contains("output") {
        return Err(format!("compute module {} must import output", record.id));
    }
    Ok(())
}

fn load_cached_compute_module(
    runtime: &Arc<ComputeModuleRuntime>,
    cwd: &Path,
    record: &ComputeModuleBuildRecord,
) -> Result<WasmtimeModule, String> {
    let artifact_hash = record
        .artifact_hash
        .clone()
        .ok_or_else(|| format!("compute module {} missing artifactHash", record.id))?;
    if let Some(module) = runtime.cache.lock().expect("compute module cache lock").get(&artifact_hash).cloned() {
        return Ok(module);
    }
    let store_path = record
        .store_path
        .as_deref()
        .ok_or_else(|| format!("compute module {} missing storePath", record.id))?;
    let full_store_path = cwd.join(store_path);
    let bytes = fs::read(&full_store_path)
        .map_err(|error| format!("compute module artifact read failed: {}", error))?;
    let module = WasmtimeModule::from_binary(&runtime.engine, &bytes)
        .map_err(|error| format!("wasmtime compile failed: {}", error))?;
    validate_compute_module_runtime(&module, record)?;
    runtime
        .cache
        .lock()
        .expect("compute module cache lock")
        .insert(artifact_hash, module.clone());
    Ok(module)
}

fn execute_compute_module_shadow(
    runtime: &Arc<ComputeModuleRuntime>,
    cwd: &Path,
    record: &ComputeModuleBuildRecord,
    input_json: &str,
) -> Result<String, String> {
    let module = load_cached_compute_module(runtime, cwd, record)?;
    let mut linker = Linker::new(&runtime.engine);
    linker
        .func_wrap(COMPUTE_MODULE_IMPORT_NAMESPACE_V1, "output", |mut caller: Caller<'_, ComputeModuleHostState>, ptr: i32, len: i32| {
            let bytes = read_memory_bytes(&mut caller, ptr, len);
            caller.data_mut().output = bytes;
        })
        .map_err(|error| format!("link output binding failed: {}", error))?;
    linker
        .func_wrap(COMPUTE_MODULE_IMPORT_NAMESPACE_V1, "log", |mut caller: Caller<'_, ComputeModuleHostState>, ptr: i32, len: i32| {
            let bytes = read_memory_bytes(&mut caller, ptr, len);
            if let Ok(text) = String::from_utf8(bytes) {
                caller.data_mut().logs.push(text);
            }
        })
        .map_err(|error| format!("link log binding failed: {}", error))?;
    linker
        .func_wrap(COMPUTE_MODULE_IMPORT_NAMESPACE_V1, "metric", |mut caller: Caller<'_, ComputeModuleHostState>, ptr: i32, len: i32| {
            let bytes = read_memory_bytes(&mut caller, ptr, len);
            if let Ok(text) = String::from_utf8(bytes) {
                caller.data_mut().metrics.push(text);
            }
        })
        .map_err(|error| format!("link metric binding failed: {}", error))?;
    let mut store = WasmtimeStore::new(&runtime.engine, ComputeModuleHostState::default());
    let fuel_budget = record.timeout_ms.unwrap_or(100).max(1).saturating_mul(100_000);
    let _ = store.set_fuel(fuel_budget);
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|error| format!("compute module instantiate failed: {}", error))?;
    let memory = instance
        .get_memory(&mut store, "memory")
        .ok_or_else(|| format!("compute module {} missing memory export", record.id))?;
    let input_bytes = input_json.as_bytes();
    let input_ptr = 1024usize;
    let required_bytes = input_ptr.saturating_add(input_bytes.len());
    let current_bytes = memory.data_size(&store);
    if required_bytes > current_bytes {
        let current_pages = current_bytes.div_ceil(65_536);
        let required_pages = required_bytes.div_ceil(65_536);
        if let Some(limit) = record.max_memory_pages {
            if required_pages as u64 > limit {
                return Err(format!("compute module {} exceeded maxMemoryPages", record.id));
            }
        }
        let delta_pages = required_pages.saturating_sub(current_pages);
        if delta_pages > 0 {
            memory
                .grow(&mut store, delta_pages as u64)
                .map_err(|error| format!("compute module memory grow failed: {}", error))?;
        }
    }
    memory
        .write(&mut store, input_ptr, input_bytes)
        .map_err(|error| format!("compute module input write failed: {}", error))?;
    let invoke = instance
        .get_typed_func::<(i32, i32), i32>(&mut store, &record.export_name)
        .map_err(|error| format!("compute module invoke load failed: {}", error))?;
    let return_code = invoke
        .call(&mut store, (input_ptr as i32, input_bytes.len() as i32))
        .map_err(|error| {
            let message = error.to_string();
            if message.to_ascii_lowercase().contains("fuel") {
                format!("timed out: {}", message)
            } else {
                format!("compute module trapped: {}", message)
            }
        })?;
    let output_bytes = store.data().output.clone();
    let output_text = String::from_utf8(output_bytes).map_err(|error| format!("guest output utf8 decode failed: {}", error))?;
    if return_code == 0 {
        if output_text.trim().is_empty() {
            return Err("guest returned success without output envelope".to_string());
        }
        return Ok(output_text);
    }
    if !output_text.trim().is_empty() {
        return Ok(output_text);
    }
    Err(format!("guest returned failure code {}", return_code))
}

fn shadow_invoke_compute_module(
    cwd: &Path,
    config: &CoreConfig,
    registry: &Arc<Mutex<Registry>>,
    runtime: &Arc<ComputeModuleRuntime>,
    host_operation: &str,
    input_json: &str,
    js_result_json: &str,
) -> ComputeModuleShadowOutcome {
    if config.compute_modules.execution_mode != ComputeModuleExecutionMode::Shadow {
        return ComputeModuleShadowOutcome {
            status: "skipped".to_string(),
            reason: Some("execution mode disabled".to_string()),
            guest_result_json: None,
            generation_id: None,
            module_id: None,
            artifact_hash: None,
            store_path: None,
        };
    }
    if host_operation != COMPUTE_MODULE_RUNTIME_TARGET_HOST_OPERATION {
        return ComputeModuleShadowOutcome {
            status: "skipped".to_string(),
            reason: Some("host operation not shadow-enabled".to_string()),
            guest_result_json: None,
            generation_id: None,
            module_id: None,
            artifact_hash: None,
            store_path: None,
        };
    }
    let (generation, record) = {
        let registry_guard = registry.lock().expect("registry lock");
        let Some(generation) = active_generation_for_compute_modules(&registry_guard) else {
            return ComputeModuleShadowOutcome {
                status: "skipped".to_string(),
                reason: Some("no active generation".to_string()),
                guest_result_json: None,
                generation_id: None,
                module_id: None,
                artifact_hash: None,
                store_path: None,
            };
        };
        let Some(record) = generation
            .compute_modules
            .iter()
            .find(|entry| entry.success && entry.host_operation == host_operation && entry.store_path.is_some())
            .cloned()
        else {
            return ComputeModuleShadowOutcome {
                status: "skipped".to_string(),
                reason: Some("no compute module artifact resolved".to_string()),
                guest_result_json: None,
                generation_id: Some(generation.id),
                module_id: None,
                artifact_hash: None,
                store_path: None,
            };
        };
        (generation, record)
    };
    let resolved = ComputeModuleShadowOutcome {
        status: "resolved".to_string(),
        reason: None,
        guest_result_json: None,
        generation_id: Some(generation.id.clone()),
        module_id: Some(record.id.clone()),
        artifact_hash: record.artifact_hash.clone(),
        store_path: record.store_path.clone(),
    };
    emit_compute_module_shadow_event(registry, "host_operation.compute_module.resolved", Some(&generation.id), &resolved);
    let started = ComputeModuleShadowOutcome { status: "started".to_string(), ..resolved.clone() };
    emit_compute_module_shadow_event(registry, "host_operation.compute_module.shadow.started", Some(&generation.id), &started);
    match execute_compute_module_shadow(runtime, cwd, &record, input_json) {
        Ok(guest_output_json) => match guest_output_to_js_response(&guest_output_json) {
            Ok(guest_result_json) => {
                let status = if guest_result_json == js_result_json {
                    "matched"
                } else {
                    "mismatched"
                };
                let outcome = ComputeModuleShadowOutcome {
                    status: status.to_string(),
                    reason: None,
                    guest_result_json: Some(guest_result_json),
                    generation_id: Some(generation.id.clone()),
                    module_id: Some(record.id.clone()),
                    artifact_hash: record.artifact_hash.clone(),
                    store_path: record.store_path.clone(),
                };
                emit_compute_module_shadow_event(
                    registry,
                    if status == "matched" {
                        "host_operation.compute_module.shadow.matched"
                    } else {
                        "host_operation.compute_module.shadow.mismatched"
                    },
                    Some(&generation.id),
                    &outcome,
                );
                outcome
            }
            Err(error) => {
                let outcome = ComputeModuleShadowOutcome {
                    status: "trapped".to_string(),
                    reason: Some(error),
                    guest_result_json: Some(guest_output_json),
                    generation_id: Some(generation.id.clone()),
                    module_id: Some(record.id.clone()),
                    artifact_hash: record.artifact_hash.clone(),
                    store_path: record.store_path.clone(),
                };
                emit_compute_module_shadow_event(
                    registry,
                    "host_operation.compute_module.shadow.trapped",
                    Some(&generation.id),
                    &outcome,
                );
                outcome
            }
        },
        Err(error) => {
            let status = if error.to_ascii_lowercase().contains("timed out") {
                "timed_out"
            } else {
                "trapped"
            };
            let outcome = ComputeModuleShadowOutcome {
                status: status.to_string(),
                reason: Some(error),
                guest_result_json: None,
                generation_id: Some(generation.id.clone()),
                module_id: Some(record.id.clone()),
                artifact_hash: record.artifact_hash.clone(),
                store_path: record.store_path.clone(),
            };
            emit_compute_module_shadow_event(
                registry,
                if status == "timed_out" {
                    "host_operation.compute_module.shadow.timed_out"
                } else {
                    "host_operation.compute_module.shadow.trapped"
                },
                Some(&generation.id),
                &outcome,
            );
            outcome
        }
    }
}

fn resolve_reload_url(process_state: &Arc<Mutex<SupervisedProcessState>>) -> Option<String> {
    let state = process_state.lock().expect("process state lock");
    state
        .frontdoor_active_reload_url
        .clone()
        .or_else(|| state.reload_url.clone())
        .filter(|value| !value.trim().is_empty())
}

fn maybe_reload_serving_runtime(
    process_state: &Arc<Mutex<SupervisedProcessState>>,
    changed_paths: &[String],
    generation_id: &str,
    registry: &Arc<Mutex<Registry>>,
) -> Result<bool, String> {
    let Some(reload_url) = resolve_reload_url(process_state) else {
        return Ok(false);
    };
    let body = format!(
        "{{\"paths\":[{}]}}",
        changed_paths.iter().map(|value| json_string(value)).collect::<Vec<_>>().join(",")
    );
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "transaction.activation.started".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: Some(generation_id.to_string()),
        message: Some(body.clone()),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    match issue_http_post_with_body(&reload_url, &body) {
        Ok(message) => {
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "transaction.activation.passed".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: Some(generation_id.to_string()),
                message: Some(if message.trim().is_empty() { "ok".to_string() } else { message }),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
            Ok(true)
        }
        Err(error) => {
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "transaction.activation.failed".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: Some(generation_id.to_string()),
                message: Some(error.clone()),
                generation: None,
                serving: None,
                emitted_at: now_iso(),
            });
            Err(error)
        }
    }
}

fn published_transaction_response_json(
    generation: &Generation,
    activated: bool,
    activation_error: Option<&str>,
) -> String {
    format!(
        "{{\"ok\":true,\"generation\":{},\"activated\":{},\"activationError\":{}}}",
        generation_to_json(generation),
        if activated { "true" } else { "false" },
        match activation_error {
            Some(value) => json_string(value),
            None => "null".to_string(),
        }
    )
}

fn apply_published_authoring_transaction(
    cwd: &Path,
    config: &CoreConfig,
    registry: &Arc<Mutex<Registry>>,
    process_state: &Arc<Mutex<SupervisedProcessState>>,
    watch_state: &Arc<Mutex<WatcherState>>,
    request: PublishedAuthoringRequest,
) -> Result<String, CapabilityError> {
    let mut resolved_edits = Vec::new();
    let generation_id = next_generation_id();
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "transaction.published.requested".to_string(),
        capability: CAP_STORAGE_WRITE.to_string(),
        generation_id: Some(generation_id.clone()),
        message: Some(format!("manifestPath={} editCount={}", request.manifest_path, request.edits.len())),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    for edit in &request.edits {
        let resolved = resolve_capability_path(cwd, config, &edit.path)?;
        let relative_path = relative_under(cwd, &resolved.full_path)
            .map_err(|message| capability_error(403, message))?;
        resolved_edits.push((edit, resolved, relative_path));
    }
    let manifest_abs = {
        let manifest_candidate = Path::new(&request.manifest_path);
        if manifest_candidate.is_absolute() {
            manifest_candidate.to_path_buf()
        } else {
            cwd.join(manifest_candidate)
        }
    };
    let manifest_relative = relative_under(cwd, &manifest_abs).map_err(|message| capability_error(403, message))?;
    let stage_root = stage_workspace_for_transaction(cwd, config, &generation_id)
        .map_err(|message| capability_error(500, message))?;
    let stage_manifest = stage_root.join(&manifest_relative);
    if !stage_manifest.exists() {
        let _ = fs::remove_dir_all(&stage_root);
        return Err(capability_error(404, "staged manifest not found"));
    }
    for (edit, _resolved, relative_path) in &resolved_edits {
        let stat = capability_fs_stat(cwd, config, &edit.path)?;
        if let Some(expected_hash) = edit.expected_hash.as_deref().filter(|value| !value.trim().is_empty()) {
            if stat.hash.as_deref() != Some(expected_hash) {
                registry.lock().expect("registry lock").emit(CoreEvent {
                    kind: AUTHORING_WRITE_CONFLICT.to_string(),
                    capability: CAP_STORAGE_WRITE.to_string(),
                    generation_id: Some(generation_id.clone()),
                    message: Some(capability_event_message(&edit.path, Some("app.source.write"), false, &request.correlation)),
                    generation: None,
                    serving: None,
                    emitted_at: now_iso(),
                });
                return Err(CapabilityError {
                    status: 409,
                    message: "source baseline hash mismatch".to_string(),
                    code: Some("WITNESS_CORE_SOURCE_CONFLICT".to_string()),
                    actual_hash: stat.hash.clone(),
                    expected_hash: Some(expected_hash.to_string()),
                    size: stat.size,
                    modified_at: stat.modified_at.clone(),
                    exists: Some(stat.exists),
                });
            }
        }
        let stage_target = stage_root.join(relative_path);
        if let Some(parent) = stage_target.parent() {
            fs::create_dir_all(parent).map_err(|error| capability_error(500, format!("staged parent mkdir failed: {}", error)))?;
        }
        fs::write(&stage_target, &edit.content).map_err(|error| capability_error(500, format!("staged source write failed: {}", error)))?;
    }
    let mut generation = Generation {
        id: generation_id.clone(),
        state: GenerationState::Candidate,
        content_hash: format!("sha256:{}", sha256_hex(package_bytes(&stage_root, config))),
        parent_id: registry.lock().expect("registry lock").aliases().current_stable,
        created_at: now_iso(),
        source_paths: resolved_edits
            .iter()
            .map(|(_, resolved, _)| resolved.source_path.clone())
            .collect(),
        compute_modules: Vec::new(),
        proofs: Vec::new(),
        correlation: request.correlation.clone(),
        promotion_decision: None,
    };
    registry.lock().expect("registry lock").upsert_generation(generation.clone(), "generation.candidate", CAP_STORAGE_WRITE);
    match run_build_worker(
        cwd,
        config,
        &stage_root,
        &normalize_path(&stage_manifest),
        &request.runtime_profile,
        &generation_id,
        registry,
    ) {
        Ok(build_result) => {
            generation.compute_modules = build_result.compute_modules;
        }
        Err(build_result) => {
            generation.compute_modules = build_result.compute_modules;
            generation.state = GenerationState::CompileFailed;
            registry.lock().expect("registry lock").upsert_generation(generation.clone(), "generation.compile_failed", CAP_STORAGE_WRITE);
            let _ = fs::remove_dir_all(&stage_root);
            return Err(CapabilityError {
                status: 400,
                message: build_result.error.unwrap_or(build_result.raw_message),
                code: Some("COMPILE_FAILED".to_string()),
                actual_hash: None,
                expected_hash: None,
                size: None,
                modified_at: None,
                exists: None,
            });
        }
    }
    generation.compute_modules = store_compute_module_artifacts(cwd, &stage_root, config, &generation.compute_modules)
        .map_err(|message| {
            generation.state = GenerationState::CompileFailed;
            registry.lock().expect("registry lock").upsert_generation(generation.clone(), "generation.compile_failed", CAP_STORAGE_WRITE);
            let _ = fs::remove_dir_all(&stage_root);
            capability_error(500, message)
        })?;
    generation.state = GenerationState::ProofRunning;
    generation.proofs.push(ProofRecord {
        name: "fast".to_string(),
        command: config.proof.fast.clone(),
        status: ProofStatus::Running,
        started_at: now_iso(),
        finished_at: None,
        duration_ms: None,
        exit_code: None,
    });
    registry.lock().expect("registry lock").upsert_generation(generation.clone(), "proof.started", CAP_PROOF_RUN);
    let proof = run_proof(&stage_root, "fast", &config.proof.fast, config.proof.slow_ms, generation.id.clone(), Arc::clone(registry));
    generation.proofs = vec![proof.clone()];
    if proof.status != ProofStatus::Passed {
        generation.state = GenerationState::ProofFailed;
        registry.lock().expect("registry lock").upsert_generation(generation.clone(), "proof.failed", CAP_PROOF_RUN);
        let _ = fs::remove_dir_all(&stage_root);
        return Err(CapabilityError {
            status: 400,
            message: "published authoring proof failed".to_string(),
            code: Some("PROOF_FAILED".to_string()),
            actual_hash: None,
            expected_hash: None,
            size: None,
            modified_at: None,
            exists: None,
        });
    }
    for edit in &request.edits {
        capability_fs_write(
            cwd,
            config,
            &edit.path,
            &edit.content,
            false,
            edit.expected_hash.as_deref(),
        )?;
    }
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "transaction.commit.applied".to_string(),
        capability: CAP_STORAGE_WRITE.to_string(),
        generation_id: Some(generation.id.clone()),
        message: Some(generation.source_paths.join(",")),
        generation: None,
        serving: None,
        emitted_at: now_iso(),
    });
    refresh_watcher_baseline(cwd, config, watch_state);
    generation.state = GenerationState::GreenLocal;
    registry.lock().expect("registry lock").upsert_generation(generation.clone(), "generation.green_local", CAP_STORAGE_WRITE);
    let serving_status = registry.lock().expect("registry lock").serving_status();
    let mut activation_error = None;
    let mut activated = false;
    if serving_status.effective_mode == ServingMode::Live {
        match maybe_reload_serving_runtime(process_state, &generation.source_paths, &generation.id, registry) {
            Ok(result) => activated = result,
            Err(error) => activation_error = Some(error),
        }
    }
    let _ = fs::remove_dir_all(&stage_root);
    Ok(published_transaction_response_json(&generation, activated, activation_error.as_deref()))
}

fn resolve_capability_path(cwd: &Path, config: &CoreConfig, requested: &str) -> Result<CapabilityPath, CapabilityError> {
    let normalized = normalize_source_request_path(requested)?;
    let direct = cwd.join(&normalized);
    if is_under_allowed_root(cwd, config, &direct) {
        return Ok(CapabilityPath {
            source_path: normalized,
            full_path: direct,
        });
    }
    for root in &config.watch.roots {
        let clean_root = normalize_path(Path::new(root));
        if clean_root.is_empty() {
            continue;
        }
        let candidate = cwd.join(&clean_root).join(&normalized);
        if is_under_allowed_root(cwd, config, &candidate) {
            return Ok(CapabilityPath {
                source_path: normalized,
                full_path: candidate,
            });
        }
    }
    Err(capability_error(403, "source path is outside configured witness-core roots"))
}

fn normalize_source_request_path(requested: &str) -> Result<String, CapabilityError> {
    let value = requested.trim().replace('\\', "/").trim_start_matches("./").to_string();
    if value.is_empty() {
        return Err(capability_error(400, "path is required"));
    }
    if value.starts_with('/') || value.contains(':') || value.split('/').any(|part| part == "..") {
        return Err(capability_error(403, "path is not a scoped source id"));
    }
    Ok(value)
}

fn is_under_allowed_root(cwd: &Path, config: &CoreConfig, candidate: &Path) -> bool {
    let Ok(candidate_relative) = candidate.strip_prefix(cwd) else {
        return false;
    };
    let candidate_relative = normalize_path(candidate_relative);
    config.watch.roots.iter().any(|root| {
        let root = normalize_path(Path::new(root)).trim_matches('/').to_string();
        !root.is_empty() && (candidate_relative == root || candidate_relative.starts_with(&format!("{}/", root)))
    }) && package_includes_path(config, &candidate_relative)
}

fn package_includes_path(config: &CoreConfig, relative: &str) -> bool {
    if config.package.include.is_empty() {
        return true;
    }
    config.package.include.iter().any(|pattern| {
        let pattern = pattern.replace('\\', "/");
        if let Some(prefix) = pattern.strip_suffix("/**") {
            relative == prefix || relative.starts_with(&format!("{}/", prefix))
        } else {
            relative == pattern
        }
    })
}

fn source_content_to_json(response: &SourceContentResponse) -> String {
    format!(
        "{{{},{},{},{}}}",
        json_pair("path", &response.source_path),
        json_pair("content", &response.content),
        json_pair("hash", &response.hash),
        json_number_optional_pair("size", Some(response.size))
    )
}

fn source_stat_to_json(response: &SourceStatResponse) -> String {
    format!(
        "{{{},{},{},{},{}}}",
        json_pair("path", &response.source_path),
        json_bool_pair("exists", response.exists),
        json_optional_pair("hash", response.hash.as_deref()),
        json_number_optional_pair("size", response.size),
        json_optional_pair("modifiedAt", response.modified_at.as_deref())
    )
}

fn capability_error_to_json(error: &CapabilityError, source_path: Option<&str>) -> String {
    let mut pairs = vec![
        json_pair("error", &error.message),
        json_optional_pair("code", error.code.as_deref()),
        json_optional_pair("path", source_path),
        json_optional_pair("expectedHash", error.expected_hash.as_deref()),
        json_optional_pair("actualHash", error.actual_hash.as_deref()),
        json_number_optional_pair("size", error.size),
        json_optional_pair("modifiedAt", error.modified_at.as_deref()),
    ];
    if let Some(exists) = error.exists {
        pairs.push(json_bool_pair("exists", exists));
    }
    format!("{{{}}}", pairs.join(","))
}

fn capability_correlation_from_params(params: &BTreeMap<String, String>) -> Correlation {
    Correlation {
        session_id: params.get("sessionId").filter(|value| !value.trim().is_empty()).cloned(),
        surface_id: params.get("surfaceId").filter(|value| !value.trim().is_empty()).cloned(),
        actor: params.get("actor").filter(|value| !value.trim().is_empty()).cloned(),
    }
}

fn capability_event_message(source_path: &str, reason: Option<&str>, preview_only: bool, correlation: &Correlation) -> String {
    format!(
        "path={} reason={} previewOnly={} sessionId={} surfaceId={} actor={}",
        source_path,
        reason.filter(|value| !value.trim().is_empty()).unwrap_or("-"),
        if preview_only { "true" } else { "false" },
        correlation.session_id.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or("-"),
        correlation.surface_id.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or("-"),
        correlation.actor.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or("-"),
    )
}

fn quote_sql_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn sqlite_value_from_json(value: &JsonValue) -> SqlValue {
    match value {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(value) => SqlValue::Integer(if *value { 1 } else { 0 }),
        JsonValue::Number(value) => {
            if let Some(integer) = value.as_i64() {
                SqlValue::Integer(integer)
            } else if let Some(float) = value.as_f64() {
                SqlValue::Real(float)
            } else {
                SqlValue::Null
            }
        }
        JsonValue::String(value) => SqlValue::Text(value.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => SqlValue::Text(value.to_string()),
    }
}

fn json_value_from_sqlite(value: ValueRef<'_>) -> JsonValue {
    match value {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(value) => JsonValue::Number(JsonNumber::from(value)),
        ValueRef::Real(value) => JsonNumber::from_f64(value).map(JsonValue::Number).unwrap_or(JsonValue::Null),
        ValueRef::Text(value) => JsonValue::String(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(value) => JsonValue::String(String::from_utf8_lossy(value).to_string()),
    }
}

enum SqliteParams {
    None,
    Positional(Vec<SqlValue>),
    Named(Vec<(String, SqlValue)>),
}

fn sqlite_params_from_json(value: Option<JsonValue>) -> Result<SqliteParams, CapabilityError> {
    let Some(value) = value else {
        return Ok(SqliteParams::None);
    };
    match value {
        JsonValue::Null => Ok(SqliteParams::None),
        JsonValue::Array(entries) => Ok(SqliteParams::Positional(
            entries.iter().map(sqlite_value_from_json).collect()
        )),
        JsonValue::Object(entries) => Ok(SqliteParams::Named(
            entries.into_iter()
                .map(|(key, value)| (format!(":{}", key), sqlite_value_from_json(&value)))
                .collect()
        )),
        _ => Err(capability_error(400, "params must be an array or object")),
    }
}

fn sqlite_body_json_value(body_text: &str, key: &str) -> Result<Option<JsonValue>, CapabilityError> {
    let Some(value_text) = extract_json_value(body_text, key) else {
        return Ok(None);
    };
    serde_json::from_str::<JsonValue>(&value_text)
        .map(Some)
        .map_err(|error| capability_error(400, format!("{} JSON invalid: {}", key, error)))
}

fn resolve_sqlite_capability_path(cwd: &Path, body_text: &str) -> Result<PathBuf, CapabilityError> {
    resolve_absolute_under_cwd(
        cwd,
        &extract_json_string_decoded(body_text, "path").unwrap_or_default(),
        "path",
    )
}

fn open_sqlite_capability_connection(database_path: &Path) -> Result<Connection, CapabilityError> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).map_err(|error| capability_error(500, format!("sqlite parent mkdir failed: {}", error)))?;
    }
    Connection::open(database_path)
        .map_err(|error| capability_error(500, format!("sqlite open failed: {}", error)))
}

fn execute_sqlite_query(connection: &Connection, sql: &str, params: &SqliteParams) -> Result<Vec<JsonValue>, CapabilityError> {
    let mut statement = connection.prepare(sql)
        .map_err(|error| capability_error(500, format!("query prepare failed: {}", error)))?;
    let column_names = statement.column_names().iter().map(|name| name.to_string()).collect::<Vec<_>>();
    let mut rows = match params {
        SqliteParams::None => statement.query([])
            .map_err(|error| capability_error(500, format!("query failed: {}", error)))?,
        SqliteParams::Positional(values) => statement.query(rusqlite::params_from_iter(values.iter()))
            .map_err(|error| capability_error(500, format!("query failed: {}", error)))?,
        SqliteParams::Named(values) => {
            let refs = values.iter()
                .map(|(key, value)| (key.as_str(), value as &dyn ToSql))
                .collect::<Vec<_>>();
            statement.query(refs.as_slice())
                .map_err(|error| capability_error(500, format!("query failed: {}", error)))?
        }
    };
    let mut result_rows = Vec::new();
    while let Some(row) = rows.next().map_err(|error| capability_error(500, format!("query cursor failed: {}", error)))? {
        let mut object = JsonMap::new();
        for (index, name) in column_names.iter().enumerate() {
            let value = row.get_ref(index)
                .map_err(|error| capability_error(500, format!("query column read failed: {}", error)))?;
            object.insert(name.clone(), json_value_from_sqlite(value));
        }
        result_rows.push(JsonValue::Object(object));
    }
    Ok(result_rows)
}

fn execute_sqlite_command(connection: &Connection, sql: &str, params: &SqliteParams) -> Result<(u64, i64), CapabilityError> {
    let mut statement = connection.prepare(sql)
        .map_err(|error| capability_error(500, format!("command prepare failed: {}", error)))?;
    let changes = match params {
        SqliteParams::None => statement.execute([]),
        SqliteParams::Positional(values) => statement.execute(rusqlite::params_from_iter(values.iter())),
        SqliteParams::Named(values) => {
            let refs = values.iter()
                .map(|(key, value)| (key.as_str(), value as &dyn ToSql))
                .collect::<Vec<_>>();
            statement.execute(refs.as_slice())
        }
    }
    .map_err(|error| capability_error(500, format!("command failed: {}", error)))?;
    Ok((changes as u64, connection.last_insert_rowid()))
}

fn sqlite_transaction_steps_from_body(body_text: &str) -> Result<Vec<(String, Option<String>, String, SqliteParams)>, CapabilityError> {
    let mut steps = Vec::new();
    for row in extract_json_object_array(body_text, "steps") {
        let kind = extract_json_string_decoded(&row, "kind").unwrap_or_default().trim().to_lowercase();
        let sql = extract_json_string_decoded(&row, "sql").unwrap_or_default();
        let name = extract_json_string_decoded(&row, "name").filter(|value| !value.trim().is_empty());
        if !matches!(kind.as_str(), "query" | "command") || sql.trim().is_empty() {
            return Err(capability_error(400, "transaction steps require kind=query|command and sql"));
        }
        let params = sqlite_params_from_json(sqlite_body_json_value(&row, "params")?)?;
        steps.push((kind, name, sql, params));
    }
    if steps.is_empty() {
        return Err(capability_error(400, "transaction steps required"));
    }
    Ok(steps)
}

fn handle_sqlite_capability_request(cwd: &Path, body_text: &str) -> Result<(String, String, String), CapabilityError> {
    let operation = extract_json_string_decoded(body_text, "operation")
        .or_else(|| extract_json_string(body_text, "operation"))
        .unwrap_or_default();
    if operation.trim().is_empty() {
        return Err(capability_error(400, "operation is required"));
    }
    let database_path = resolve_sqlite_capability_path(cwd, body_text)?;
    let source_path = normalize_path(database_path.strip_prefix(cwd).unwrap_or(&database_path));
    let mut connection = open_sqlite_capability_connection(&database_path)?;
    let response = match operation.as_str() {
        "testConnection" => {
            connection.query_row("select 1", [], |_| Ok(()))
                .map_err(|error| capability_error(500, format!("sqlite testConnection failed: {}", error)))?;
            serde_json::to_string(&serde_json::json!({ "ok": true }))
                .map_err(|error| capability_error(500, format!("sqlite JSON encode failed: {}", error)))?
        }
        "migrate" => {
            let migration_table = extract_json_string_decoded(body_text, "migrationTable").unwrap_or_else(|| "witness_sql_migrations".to_string());
            let migration_table = migration_table.trim().to_string();
            if !migration_table.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') || migration_table.is_empty() || migration_table.chars().next().unwrap().is_ascii_digit() {
                return Err(capability_error(400, "migrationTable must be a SQL identifier"));
            }
            let migrations = extract_json_object_array(body_text, "migrations")
                .into_iter()
                .map(|row| {
                    Ok((
                        extract_json_string_decoded(&row, "id").unwrap_or_default(),
                        extract_json_string_decoded(&row, "sql").unwrap_or_default(),
                    ))
                })
                .collect::<Result<Vec<_>, CapabilityError>>()?;
            if migrations.is_empty() {
                return Err(capability_error(400, "migrations required"));
            }
            if migrations.iter().any(|(id, sql)| id.trim().is_empty() || sql.trim().is_empty()) {
                return Err(capability_error(400, "each migration requires id and sql"));
            }
            let table = quote_sql_identifier(&migration_table);
            connection.execute(
                &format!("create table if not exists {} (id text primary key, applied_at text not null)", table),
                [],
            ).map_err(|error| capability_error(500, format!("migration ledger failed: {}", error)))?;
            let tx = connection.transaction()
                .map_err(|error| capability_error(500, format!("migration begin failed: {}", error)))?;
            let lookup_sql = format!("select id from {} where id = ?", table);
            let insert_sql = format!("insert into {} (id, applied_at) values (?, ?)", table);
            let mut applied = Vec::new();
            let mut skipped = Vec::new();
            for (id, sql) in migrations {
                let existing = tx.query_row(&lookup_sql, [id.as_str()], |_| Ok(()));
                if existing.is_ok() {
                    skipped.push(id);
                    continue;
                }
                tx.execute_batch(&sql)
                    .map_err(|error| capability_error(500, format!("migration failed: {}", error)))?;
                let applied_at = now_iso();
                tx.execute(&insert_sql, [id.as_str(), applied_at.as_str()])
                    .map_err(|error| capability_error(500, format!("migration ledger insert failed: {}", error)))?;
                applied.push(id);
            }
            tx.commit().map_err(|error| capability_error(500, format!("migration commit failed: {}", error)))?;
            serde_json::to_string(&serde_json::json!({ "ok": true, "applied": applied, "skipped": skipped }))
                .map_err(|error| capability_error(500, format!("sqlite JSON encode failed: {}", error)))?
        }
        "query" => {
            let sql = extract_json_string_decoded(body_text, "sql").unwrap_or_default();
            if sql.trim().is_empty() {
                return Err(capability_error(400, "sql required"));
            }
            let params = sqlite_params_from_json(sqlite_body_json_value(body_text, "params")?)?;
            let rows = execute_sqlite_query(&connection, &sql, &params)?;
            serde_json::to_string(&serde_json::json!({ "ok": true, "rows": rows, "rowCount": rows.len() }))
                .map_err(|error| capability_error(500, format!("sqlite JSON encode failed: {}", error)))?
        }
        "command" => {
            let sql = extract_json_string_decoded(body_text, "sql").unwrap_or_default();
            if sql.trim().is_empty() {
                return Err(capability_error(400, "sql required"));
            }
            let params = sqlite_params_from_json(sqlite_body_json_value(body_text, "params")?)?;
            let (changes, last_insert_rowid) = execute_sqlite_command(&connection, &sql, &params)?;
            serde_json::to_string(&serde_json::json!({ "ok": true, "changes": changes, "lastInsertRowid": last_insert_rowid }))
                .map_err(|error| capability_error(500, format!("sqlite JSON encode failed: {}", error)))?
        }
        "transaction" => {
            let steps = sqlite_transaction_steps_from_body(body_text)?;
            let tx = connection.transaction()
                .map_err(|error| capability_error(500, format!("transaction begin failed: {}", error)))?;
            let mut results = Vec::new();
            for (kind, name, sql, params) in steps {
                if kind == "query" {
                    let rows = execute_sqlite_query(&tx, &sql, &params)?;
                    results.push(serde_json::json!({
                        "kind": kind,
                        "name": name,
                        "rowCount": rows.len(),
                        "rows": rows
                    }));
                } else {
                    let (changes, last_insert_rowid) = execute_sqlite_command(&tx, &sql, &params)?;
                    results.push(serde_json::json!({
                        "kind": kind,
                        "name": name,
                        "changes": changes,
                        "lastInsertRowid": last_insert_rowid
                    }));
                }
            }
            tx.commit().map_err(|error| capability_error(500, format!("transaction commit failed: {}", error)))?;
            serde_json::to_string(&serde_json::json!({ "ok": true, "results": results }))
                .map_err(|error| capability_error(500, format!("sqlite JSON encode failed: {}", error)))?
        }
        _ => return Err(capability_error(400, "unsupported sqlite capability operation")),
    };
    Ok((response, operation, source_path))
}

struct VerificationPersistencePaths {
    artifact_root: PathBuf,
    cache_root: PathBuf,
    store_root: PathBuf,
}

fn resolve_absolute_under_cwd(cwd: &Path, requested: &str, label: &str) -> Result<PathBuf, CapabilityError> {
    let trimmed = requested.trim();
    if trimmed.is_empty() {
        return Err(capability_error(400, &format!("{} is required", label)));
    }
    let candidate = if Path::new(trimmed).is_absolute() {
        PathBuf::from(trimmed)
    } else {
        cwd.join(trimmed)
    };
    let normalized = normalize_path(&candidate);
    let resolved = PathBuf::from(&normalized);
    if !resolved.starts_with(cwd) {
        return Err(capability_error(403, &format!("{} is outside the workspace root", label)));
    }
    Ok(resolved)
}

fn verification_persistence_paths_from_body(cwd: &Path, body_text: &str) -> Result<VerificationPersistencePaths, CapabilityError> {
    let verification_root = resolve_absolute_under_cwd(
        cwd,
        &extract_json_string_decoded(body_text, "verificationRoot").unwrap_or_default(),
        "verificationRoot",
    )?;
    let artifact_root = resolve_absolute_under_cwd(
        cwd,
        &extract_json_string_decoded(body_text, "artifactRoot").unwrap_or_default(),
        "artifactRoot",
    )?;
    let cache_root = resolve_absolute_under_cwd(
        cwd,
        &extract_json_string_decoded(body_text, "cacheRoot").unwrap_or_default(),
        "cacheRoot",
    )?;
    let store_root = verification_root
        .join(".witness-core")
        .join("verification-persistence");
    Ok(VerificationPersistencePaths {
        artifact_root,
        cache_root,
        store_root,
    })
}

fn verification_bucket_dir(paths: &VerificationPersistencePaths, bucket: &str) -> PathBuf {
    paths.store_root.join("rows").join(bucket)
}

fn verification_row_path(paths: &VerificationPersistencePaths, bucket: &str, id: &str) -> PathBuf {
    verification_bucket_dir(paths, bucket).join(format!("{}.json", sha256_hex(id.as_bytes().to_vec())))
}

fn write_verification_row(paths: &VerificationPersistencePaths, bucket: &str, id: &str, row_json: &str) -> Result<(), CapabilityError> {
    let file_path = verification_row_path(paths, bucket, id);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| capability_error(500, &format!("verification persistence mkdir failed: {}", error)))?;
    }
    fs::write(file_path, row_json).map_err(|error| capability_error(500, &format!("verification persistence write failed: {}", error)))
}

fn read_verification_bucket_rows(paths: &VerificationPersistencePaths, bucket: &str) -> Result<Vec<String>, CapabilityError> {
    let dir = verification_bucket_dir(paths, bucket);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut rows = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| capability_error(500, &format!("verification persistence read_dir failed: {}", error)))?;
        let file_type = entry.file_type().map_err(|error| capability_error(500, &format!("verification persistence file_type failed: {}", error)))?;
        if !file_type.is_file() {
            continue;
        }
        let content = fs::read_to_string(entry.path())
            .map_err(|error| capability_error(500, &format!("verification persistence row read failed: {}", error)))?;
        if !content.trim().is_empty() {
            rows.push(content);
        }
    }
    Ok(rows)
}

fn resolve_subpath_under_root(root: &Path, requested_path: &str, label: &str) -> Result<PathBuf, CapabilityError> {
    let trimmed = requested_path.trim();
    if trimmed.is_empty() {
        return Err(capability_error(400, &format!("{} is required", label)));
    }
    let candidate = PathBuf::from(trimmed);
    if !candidate.starts_with(root) {
        return Err(capability_error(403, &format!("{} is outside the configured verification roots", label)));
    }
    Ok(candidate)
}

fn write_text_file(file_path: &Path, content: &str) -> Result<(), CapabilityError> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| capability_error(500, &format!("verification persistence mkdir failed: {}", error)))?;
    }
    fs::write(file_path, content).map_err(|error| capability_error(500, &format!("verification persistence write failed: {}", error)))
}

fn verification_rows_to_json(paths: &VerificationPersistencePaths) -> Result<String, CapabilityError> {
    let verification_policies = read_verification_bucket_rows(paths, "verificationPolicies")?.join(",");
    let verification_freshness = read_verification_bucket_rows(paths, "verificationFreshness")?.join(",");
    let verification_invalidations = read_verification_bucket_rows(paths, "verificationInvalidations")?.join(",");
    let verification_queue = read_verification_bucket_rows(paths, "verificationQueue")?.join(",");
    let verification_executions = read_verification_bucket_rows(paths, "verificationExecutions")?.join(",");
    let test_runs = read_verification_bucket_rows(paths, "testRuns")?.join(",");
    let test_results = read_verification_bucket_rows(paths, "testResults")?.join(",");
    let artifacts = read_verification_bucket_rows(paths, "artifacts")?.join(",");
    let test_artifacts = read_verification_bucket_rows(paths, "testArtifacts")?.join(",");
    let test_suites = read_verification_bucket_rows(paths, "testSuites")?.join(",");
    let test_cases = read_verification_bucket_rows(paths, "testCases")?.join(",");
    let test_reports = read_verification_bucket_rows(paths, "testReports")?.join(",");
    Ok(format!(
        "{{\"verificationPolicies\":[{}],\"verificationFreshness\":[{}],\"verificationInvalidations\":[{}],\"verificationQueue\":[{}],\"verificationExecutions\":[{}],\"testRuns\":[{}],\"testResults\":[{}],\"artifacts\":[{}],\"testArtifacts\":[{}],\"testSuites\":[{}],\"testCases\":[{}],\"testReports\":[{}]}}",
        verification_policies,
        verification_freshness,
        verification_invalidations,
        verification_queue,
        verification_executions,
        test_runs,
        test_results,
        artifacts,
        test_artifacts,
        test_suites,
        test_cases,
        test_reports
    ))
}

fn verification_read_artifact_content_json(
    paths: &VerificationPersistencePaths,
    artifact_id: &str,
    compatibility: &str,
) -> Result<String, CapabilityError> {
    let requested_id = artifact_id.trim();
    if requested_id.is_empty() {
        return Err(capability_error(400, "artifactId is required"));
    }
    let test_artifact_rows = read_verification_bucket_rows(paths, "testArtifacts")?;
    let artifact_rows = read_verification_bucket_rows(paths, "artifacts")?;
    let artifact_row = if compatibility == "testArtifact" {
        test_artifact_rows
            .iter()
            .find(|row| {
                extract_json_string_decoded(row, "id").as_deref() == Some(requested_id)
                    || extract_json_string_decoded(row, "artifactId").as_deref() == Some(requested_id)
            })
            .cloned()
    } else {
        artifact_rows
            .iter()
            .find(|row| extract_json_string_decoded(row, "id").as_deref() == Some(requested_id))
            .cloned()
            .or_else(|| {
                test_artifact_rows
                    .iter()
                    .find(|row| {
                        extract_json_string_decoded(row, "id").as_deref() == Some(requested_id)
                            || extract_json_string_decoded(row, "artifactId").as_deref() == Some(requested_id)
                    })
                    .cloned()
            })
    };
    let Some(artifact_row) = artifact_row else {
        return Ok("{\"ok\":false,\"status\":404,\"error\":\"artifact content not found\"}".to_string());
    };
    let Some(content_ref) = extract_json_string_decoded(&artifact_row, "contentRef") else {
        return Ok("{\"ok\":false,\"status\":404,\"error\":\"artifact content not found\"}".to_string());
    };
    let artifact_path = resolve_subpath_under_root(&paths.artifact_root, &content_ref, "contentRef")?;
    let Ok(content) = fs::read_to_string(&artifact_path) else {
        return Ok("{\"ok\":false,\"status\":404,\"error\":\"artifact content not found\"}".to_string());
    };
    let content_type = extract_json_string_decoded(&artifact_row, "contentType").unwrap_or_else(|| "text/plain".to_string());
    Ok(format!(
        "{{\"ok\":true,\"status\":200,\"artifact\":{},\"content\":{},\"contentType\":{}}}",
        artifact_row,
        json_string(&content),
        json_string(&content_type)
    ))
}

fn verification_find_reusable_result_json(paths: &VerificationPersistencePaths, cache_key: &str) -> Result<String, CapabilityError> {
    let cache_key = cache_key.trim();
    if cache_key.is_empty() {
        return Err(capability_error(400, "cacheKey is required"));
    }
    let cache_rows = read_verification_bucket_rows(paths, "cacheEntries")?;
    let latest_result = cache_rows
        .iter()
        .find(|row| extract_json_string_decoded(row, "cacheKey").as_deref() == Some(cache_key))
        .and_then(|row| extract_json_value(row, "latestResult"))
        .unwrap_or_else(|| "null".to_string());
    Ok(format!("{{\"latestResult\":{}}}", latest_result))
}

fn verification_persist_bundle(paths: &VerificationPersistencePaths, body_text: &str) -> Result<(), CapabilityError> {
    if let Some(test_run_json) = extract_json_value(body_text, "testRun").filter(|value| value.trim() != "null") {
        if let Some(id) = extract_json_string_decoded(&test_run_json, "id").or_else(|| extract_json_string(&test_run_json, "id")) {
            write_verification_row(paths, "testRuns", &id, &test_run_json)?;
        }
    }
    for row in extract_json_object_array(body_text, "testResults") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "testResults", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "artifacts") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "artifacts", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "testArtifacts") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "testArtifacts", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "testSuites") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "testSuites", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "testCases") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "testCases", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "testReports") {
        if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
            write_verification_row(paths, "testReports", &id, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "cacheEntries") {
        if let Some(cache_key) = extract_json_string_decoded(&row, "cacheKey").or_else(|| extract_json_string(&row, "cacheKey")) {
            write_verification_row(paths, "cacheEntries", &cache_key, &row)?;
        }
    }
    for row in extract_json_object_array(body_text, "artifactContents") {
        let Some(content_ref) = extract_json_string_decoded(&row, "contentRef").or_else(|| extract_json_string(&row, "contentRef")) else {
            continue;
        };
        let Some(content) = extract_json_string_decoded(&row, "content").or_else(|| extract_json_string(&row, "content")) else {
            continue;
        };
        let artifact_path = resolve_subpath_under_root(&paths.artifact_root, &content_ref, "contentRef")?;
        write_text_file(&artifact_path, &content)?;
    }
    for row in extract_json_object_array(body_text, "cacheFiles") {
        let Some(cache_path) = extract_json_string_decoded(&row, "cachePath").or_else(|| extract_json_string(&row, "cachePath")) else {
            continue;
        };
        let Some(content_json) = extract_json_string_decoded(&row, "contentJson").or_else(|| extract_json_string(&row, "contentJson")) else {
            continue;
        };
        let cache_file_path = resolve_subpath_under_root(&paths.cache_root, &cache_path, "cachePath")?;
        write_text_file(&cache_file_path, &content_json)?;
    }
    Ok(())
}

fn handle_verification_persistence_request(cwd: &Path, body_text: &str) -> Result<(String, String), CapabilityError> {
    let operation = extract_json_string_decoded(body_text, "operation")
        .or_else(|| extract_json_string(body_text, "operation"))
        .unwrap_or_default();
    if operation.trim().is_empty() {
        return Err(capability_error(400, "operation is required"));
    }
    let paths = verification_persistence_paths_from_body(cwd, body_text)?;
    let response = match operation.as_str() {
        "readModelRows" => verification_rows_to_json(&paths)?,
        "recordPolicyRows" => {
            for row in extract_json_object_array(body_text, "rows") {
                if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
                    write_verification_row(&paths, "verificationPolicies", &id, &row)?;
                }
            }
            "{\"ok\":true}".to_string()
        }
        "recordFreshnessRows" => {
            for row in extract_json_object_array(body_text, "rows") {
                if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
                    write_verification_row(&paths, "verificationFreshness", &id, &row)?;
                }
            }
            "{\"ok\":true}".to_string()
        }
        "recordInvalidationRows" => {
            for row in extract_json_object_array(body_text, "rows") {
                if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
                    write_verification_row(&paths, "verificationInvalidations", &id, &row)?;
                }
            }
            "{\"ok\":true}".to_string()
        }
        "recordQueueRow" => {
            if let Some(row) = extract_json_value(body_text, "row").filter(|value| value.trim() != "null") {
                if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
                    write_verification_row(&paths, "verificationQueue", &id, &row)?;
                }
            }
            "{\"ok\":true}".to_string()
        }
        "recordExecutionRow" => {
            if let Some(row) = extract_json_value(body_text, "row").filter(|value| value.trim() != "null") {
                if let Some(id) = extract_json_string_decoded(&row, "id").or_else(|| extract_json_string(&row, "id")) {
                    write_verification_row(&paths, "verificationExecutions", &id, &row)?;
                }
            }
            "{\"ok\":true}".to_string()
        }
        "persistTestRunBundle" => {
            verification_persist_bundle(&paths, body_text)?;
            "{\"ok\":true}".to_string()
        }
        "findReusablePassedResult" => verification_find_reusable_result_json(
            &paths,
            &extract_json_string_decoded(body_text, "cacheKey").unwrap_or_default(),
        )?,
        "readArtifactContent" => verification_read_artifact_content_json(
            &paths,
            &extract_json_string_decoded(body_text, "artifactId").unwrap_or_default(),
            &extract_json_string_decoded(body_text, "compatibility").unwrap_or_else(|| "canonical".to_string()),
        )?,
        _ => return Err(capability_error(400, "unsupported verification persistence operation")),
    };
    Ok((response, operation))
}

fn registry_to_json(registry: &Registry) -> String {
    let generations = registry.generations().iter().map(generation_to_json).collect::<Vec<_>>().join(",");
    format!(
        "{{\"aliases\":{},\"serving\":{},\"soak\":{},\"generations\":[{}]}}",
        aliases_to_json(&registry.aliases()),
        serving_status_to_json(&registry.serving_status()),
        soak_state_to_json(&registry.soak_state()),
        generations
    )
}

fn soak_state_to_json(soak: &SoakState) -> String {
    format!(
        "{{{},{}}}",
        json_object_optional_pair("currentSession", soak.current_session.as_ref().map(soak_session_to_json)),
        json_object_optional_pair("lastSession", soak.last_session.as_ref().map(soak_session_to_json))
    )
}

fn soak_session_to_json(session: &SoakSession) -> String {
    let marks = session.marks.iter().map(soak_mark_json).collect::<Vec<_>>().join(",");
    format!(
        "{{{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}}}",
        json_pair("id", &session.id),
        json_pair("scenario", &session.scenario),
        json_pair("status", &session.status),
        json_pair("startedAt", &session.started_at),
        json_pair("updatedAt", &session.updated_at),
        json_optional_pair("completedAt", session.completed_at.as_deref()),
        json_optional_pair("failureReason", session.failure_reason.as_deref()),
        json_number_optional_pair("sampleCount", Some(session.sample_count)),
        json_number_optional_pair("healthySamples", Some(session.healthy_samples)),
        json_number_optional_pair("degradedSamples", Some(session.degraded_samples)),
        json_number_optional_pair("unhealthySamples", Some(session.unhealthy_samples)),
        json_bool_pair("restartObserved", session.restart_observed),
        json_bool_pair("stableFailoverObserved", session.stable_failover_observed),
        json_number_optional_pair("startRestartCount", Some(session.start_restart_count)),
        json_number_optional_pair("latestRestartCount", Some(session.latest_restart_count)),
        json_optional_pair("currentPhase", session.current_phase.as_deref()),
        json_object_optional_pair("latestSample", session.latest_sample.as_ref().map(soak_sample_json)),
        format!("\"marks\":[{}],\"highWater\":{}", marks, soak_high_water_json(&session.high_water))
    )
}

fn soak_mark_json(mark: &SoakMark) -> String {
    format!(
        "{{{},{},{}}}",
        json_pair("phase", &mark.phase),
        json_optional_pair("message", mark.message.as_deref()),
        json_pair("markedAt", &mark.marked_at)
    )
}

fn soak_mark_to_json(session_id: &str, mark: &SoakMark) -> String {
    format!(
        "{{{},{},{},{}}}",
        json_pair("sessionId", session_id),
        json_pair("phase", &mark.phase),
        json_optional_pair("message", mark.message.as_deref()),
        json_pair("markedAt", &mark.marked_at)
    )
}

fn soak_high_water_json(high_water: &SoakHighWater) -> String {
    format!(
        "{{{},{},{},{},{},{},{},{},{},{}}}",
        json_number_optional_pair("rss", Some(high_water.rss)),
        json_number_optional_pair("heapUsed", Some(high_water.heap_used)),
        json_number_optional_pair("eventLoopP95Ms", Some(high_water.event_loop_p95_ms)),
        json_number_optional_pair("activeRequests", Some(high_water.active_requests)),
        json_number_optional_pair("sseClients", Some(high_water.sse_clients)),
        json_number_optional_pair("previewSessions", Some(high_water.preview_sessions)),
        json_number_optional_pair("snapshotWatchers", Some(high_water.snapshot_watchers)),
        json_number_optional_pair("fsWatcherResources", Some(high_water.fswatcher_resources)),
        json_number_optional_pair("timeoutResources", Some(high_water.timeout_resources)),
        json_number_optional_pair("restartCount", Some(high_water.restart_count))
    )
}

fn soak_sample_json(sample: &SoakSample) -> String {
    format!(
        "{{{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}}}",
        json_number_optional_pair("sequence", Some(sample.sequence)),
        json_optional_pair("phase", sample.phase.as_deref()),
        json_pair("sampledAt", &sample.sampled_at),
        json_bool_pair("ready", sample.ready),
        json_pair("status", &sample.status),
        json_string_array_pair("reasonCodes", &sample.reason_codes),
        json_number_optional_pair("rss", Some(sample.rss)),
        json_number_optional_pair("heapUsed", Some(sample.heap_used)),
        json_number_optional_pair("eventLoopP95Ms", Some(sample.event_loop_p95_ms)),
        json_number_optional_pair("activeRequests", Some(sample.active_requests)),
        json_number_optional_pair("sseClients", Some(sample.sse_clients)),
        json_number_optional_pair("previewSessions", Some(sample.preview_sessions)),
        json_number_optional_pair("snapshotWatchers", Some(sample.snapshot_watchers)),
        json_number_optional_pair("fsWatcherResources", Some(sample.fswatcher_resources)),
        json_number_optional_pair("timeoutResources", Some(sample.timeout_resources)),
        json_bool_pair("processRunning", sample.process_running),
        json_bool_pair("processReady", sample.process_ready),
        json_number_optional_pair("pid", sample.pid.map(|value| value as u64)),
        json_number_optional_pair("restartCount", Some(sample.restart_count)),
        json_pair("servingRequestedMode", &sample.serving_requested_mode),
        json_pair("servingEffectiveMode", &sample.serving_effective_mode),
        json_pair("servingReason", &sample.serving_reason),
        json_optional_pair("latestGenerationId", sample.latest_generation_id.as_deref()),
        format!(
            "{},{}",
            json_optional_pair("latestGenerationState", sample.latest_generation_state.as_deref()),
            json_bool_pair("stableFailover", sample.stable_failover)
        )
    )
}

fn soak_sample_payload_to_json(session_id: &str, sample: &SoakSample) -> String {
    let inner = soak_sample_json(sample);
    format!(
        "{{{},{} }}",
        json_pair("sessionId", session_id),
        inner.trim_start_matches('{').trim_end_matches('}')
    )
}

fn soak_session_finish_to_json(session: &SoakSession, message: Option<&str>) -> String {
    format!(
        "{{{},{},{},{}}}",
        json_pair("id", &session.id),
        json_pair("status", &session.status),
        json_pair("updatedAt", &session.updated_at),
        json_optional_pair(
            "message",
            message
                .filter(|value| !value.trim().is_empty())
                .or(session.failure_reason.as_deref())
        )
    )
}

fn generation_to_json(generation: &Generation) -> String {
    let source_paths = generation.source_paths.iter().map(|v| json_string(v)).collect::<Vec<_>>().join(",");
    let compute_modules = generation
        .compute_modules
        .iter()
        .map(compute_module_build_record_to_json)
        .collect::<Vec<_>>()
        .join(",");
    let proofs = generation.proofs.iter().map(proof_to_json).collect::<Vec<_>>().join(",");
    format!(
        "{{{},{},{},{},{},\"sourcePaths\":[{}],\"computeModuleCount\":{},\"computeModules\":[{}],\"proofs\":[{}],\"correlation\":{},{} }}",
        json_pair("id", &generation.id),
        json_pair("state", generation.state.as_str()),
        json_pair("contentHash", &generation.content_hash),
        json_optional_pair("parentId", generation.parent_id.as_deref()),
        json_pair("createdAt", &generation.created_at),
        source_paths,
        generation.compute_modules.len(),
        compute_modules,
        proofs,
        correlation_to_json(&generation.correlation),
        json_optional_pair("promotionDecision", generation.promotion_decision.as_deref())
    )
}

fn compute_module_build_record_to_json(record: &ComputeModuleBuildRecord) -> String {
    let allowed_bindings = record.allowed_bindings
        .iter()
        .map(|binding| json_string(binding))
        .collect::<Vec<_>>()
        .join(",");
    let fields = vec![
        json_pair("id", &record.id),
        json_pair("hostOperation", &record.host_operation),
        json_pair("source", &record.source),
        json_optional_pair("artifactPath", record.artifact_path.as_deref()),
        json_optional_pair("artifactHash", record.artifact_hash.as_deref()),
        json_optional_pair("storePath", record.store_path.as_deref()),
        json_pair("language", &record.language),
        json_pair("abi", &record.abi),
        json_pair("export", &record.export_name),
        json_number_optional_pair("maxMemoryPages", record.max_memory_pages),
        json_number_optional_pair("timeoutMs", record.timeout_ms),
        format!("\"allowedBindings\":[{}]", allowed_bindings),
        json_optional_pair("context", record.context.as_deref()),
        json_bool_pair("success", record.success),
        json_optional_pair("error", record.error.as_deref())
    ];
    format!("{{{}}}", fields.join(","))
}

fn proof_to_json(proof: &ProofRecord) -> String {
    format!(
        "{{{},{},{},{},{},{},{}}}",
        json_pair("name", &proof.name),
        json_pair("command", &proof.command),
        json_pair("status", proof.status.as_str()),
        json_pair("startedAt", &proof.started_at),
        json_optional_pair("finishedAt", proof.finished_at.as_deref()),
        json_number_optional_pair("durationMs", proof.duration_ms.map(|v| v as u64)),
        json_number_optional_pair("exitCode", proof.exit_code.map(|v| v as u64))
    )
}

fn aliases_to_json(aliases: &Aliases) -> String {
    format!(
        "{{{},{},{}}}",
        json_optional_pair("current_stable", aliases.current_stable.as_deref()),
        json_optional_pair("current_green_local", aliases.current_green_local.as_deref()),
        json_optional_pair("last_good", aliases.last_good.as_deref())
    )
}

fn serving_directive_to_json(serving: &ServingDirective) -> String {
    format!(
        "{{{},{}}}",
        json_pair("requestedMode", serving.requested_mode.as_str()),
        json_pair("updatedAt", &serving.updated_at)
    )
}

fn serving_status_to_json(serving: &ServingStatus) -> String {
    format!(
        "{{{},{},{},{},{},{},{},{},{}}}",
        json_pair("requestedMode", serving.requested_mode.as_str()),
        json_pair("effectiveMode", serving.effective_mode.as_str()),
        json_pair("reason", &serving.reason),
        json_pair("updatedAt", &serving.updated_at),
        json_optional_pair("latestGenerationId", serving.latest_generation_id.as_deref()),
        json_optional_pair("latestGenerationState", serving.latest_generation_state.as_deref()),
        json_optional_pair("currentStable", serving.current_stable.as_deref()),
        json_optional_pair("currentGreenLocal", serving.current_green_local.as_deref()),
        json_optional_pair("lastGood", serving.last_good.as_deref())
    )
}

fn supervised_process_state_to_json(state: &SupervisedProcessState) -> String {
    let instances = state.instances.iter().map(supervised_process_instance_to_json).collect::<Vec<_>>().join(",");
    let fields = vec![
        json_optional_pair("command", state.command.as_deref()),
        json_optional_pair("workingDir", state.working_dir.as_deref()),
        json_bool_pair("restartOnExit", state.restart_on_exit),
        json_bool_pair("restartOnUnhealthy", state.restart_on_unhealthy),
        json_bool_pair("running", state.running),
        json_number_optional_pair("pid", state.pid.map(|value| value as u64)),
        json_number_optional_pair("restartCount", Some(state.restart_count)),
        json_optional_pair("lastStartedAt", state.last_started_at.as_deref()),
        json_optional_pair("lastExitedAt", state.last_exited_at.as_deref()),
        json_number_optional_pair("lastExitCode", state.last_exit_code.map(|value| value as u64)),
        json_optional_pair("lastError", state.last_error.as_deref()),
        json_bool_pair("ready", state.ready),
        json_optional_pair("lastReadyAt", state.last_ready_at.as_deref()),
        json_optional_pair("lastHealthStatus", state.last_health_status.as_deref()),
        json_optional_pair("status", state.status.as_deref()),
        json_string_array_pair("reasonCodes", &state.reason_codes),
        json_optional_pair("lastHealthSampleAt", state.last_health_sample_at.as_deref()),
        json_optional_pair("healthUrl", state.health_url.as_deref()),
        json_optional_pair("reloadUrl", state.reload_url.as_deref()),
        json_number_optional_pair("degradedStreak", Some(state.degraded_streak)),
        json_number_optional_pair("unhealthyStreak", Some(state.unhealthy_streak)),
        json_optional_pair("lastRestartReason", state.last_restart_reason.as_deref()),
        json_bool_pair("stopRequested", state.stop_requested),
        json_bool_pair("restartRequested", state.restart_requested),
        json_optional_pair("instanceId", state.instance_id.as_deref()),
        json_optional_pair("role", state.role.as_deref()),
        json_bool_pair("mutationsEnabled", state.mutations_enabled),
        json_bool_pair("watchersEnabled", state.watchers_enabled),
        json_bool_pair("frontdoorEnabled", state.frontdoor_enabled),
        json_optional_pair("publicAddr", state.public_addr.as_deref()),
        json_optional_pair("activeInstanceId", state.frontdoor_active_instance_id.as_deref()),
        json_optional_pair("activeTarget", state.frontdoor_active_target.as_deref()),
        json_optional_pair("activeReloadUrl", state.frontdoor_active_reload_url.as_deref()),
        format!("\"instances\":[{}]", instances)
    ];
    format!("{{{}}}", fields.join(","))
}

fn supervised_process_instance_to_json(instance: &SupervisedProcessInstanceState) -> String {
    format!(
        "{{{},{},{},{},{},{},{},{},{},{},{},{},{}}}",
        json_pair("id", &instance.id),
        json_pair("state", &instance.state),
        json_number_optional_pair("port", instance.port.map(|value| value as u64)),
        json_bool_pair("running", instance.running),
        json_bool_pair("ready", instance.ready),
        json_number_optional_pair("pid", instance.pid.map(|value| value as u64)),
        json_number_optional_pair("inflightConnections", Some(instance.inflight_connections)),
        json_optional_pair("lastStartedAt", instance.last_started_at.as_deref()),
        json_optional_pair("lastExitedAt", instance.last_exited_at.as_deref()),
        json_optional_pair("lastHealthStatus", instance.last_health_status.as_deref()),
        json_optional_pair("drainStartedAt", instance.drain_started_at.as_deref()),
        json_optional_pair("drainFinishedAt", instance.drain_finished_at.as_deref()),
        json_optional_pair("role", instance.role.as_deref())
    )
}

fn correlation_to_json(correlation: &Correlation) -> String {
    format!(
        "{{{},{},{}}}",
        json_optional_pair("sessionId", correlation.session_id.as_deref()),
        json_optional_pair("surfaceId", correlation.surface_id.as_deref()),
        json_optional_pair("actor", correlation.actor.as_deref())
    )
}

fn json_pair(key: &str, value: &str) -> String {
    format!("\"{}\":{}", key, json_string(value))
}

fn json_optional_pair(key: &str, value: Option<&str>) -> String {
    match value {
        Some(value) => json_pair(key, value),
        None => format!("\"{}\":null", key),
    }
}

fn json_optional_value(value: Option<&str>) -> String {
    match value {
        Some(value) => json_string(value),
        None => "null".to_string(),
    }
}

fn json_bool_pair(key: &str, value: bool) -> String {
    format!("\"{}\":{}", key, if value { "true" } else { "false" })
}

fn json_object_optional_pair(key: &str, value: Option<String>) -> String {
    match value {
        Some(value) => format!("\"{}\":{}", key, value),
        None => format!("\"{}\":null", key),
    }
}

fn json_number_optional_pair(key: &str, value: Option<u64>) -> String {
    match value {
        Some(value) => format!("\"{}\":{}", key, value),
        None => format!("\"{}\":null", key),
    }
}

fn json_string_array_pair(key: &str, values: &[String]) -> String {
    format!(
        "\"{}\":[{}]",
        key,
        values
            .iter()
            .map(|value| json_string(value))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn json_string(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t");
    format!("\"{}\"", escaped)
}

fn generation_event_kind(state: &GenerationState) -> &'static str {
    match state {
        GenerationState::CompileFailed => "generation.compile_failed",
        GenerationState::ProofRunning => "proof.started",
        GenerationState::ProofFailed => "proof.failed",
        GenerationState::GreenLocal => "generation.green_local",
        GenerationState::Stable => "generation.promoted",
        GenerationState::Retired => "generation.retired",
        GenerationState::Candidate => "generation.candidate",
    }
}

fn parse_form_body(body: &str) -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();
    for pair in body.split('&') {
        if pair.trim().is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        values.insert(percent_decode(key), percent_decode(value));
    }
    values
}

fn percent_decode(value: &str) -> String {
    let mut output = Vec::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                output.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let decoded = std::str::from_utf8(&bytes[index + 1..index + 3])
                    .ok()
                    .and_then(|hex| u8::from_str_radix(hex, 16).ok());
                if let Some(decoded) = decoded {
                    output.push(decoded);
                    index += 3;
                } else {
                    output.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn parse_string(value: &str) -> String {
    value.trim().trim_matches('"').to_string()
}

fn parse_string_array(value: &str) -> Vec<String> {
    let trimmed = value.trim().trim_start_matches('[').trim_end_matches(']');
    trimmed
        .split(',')
        .map(parse_string)
        .filter(|value| !value.is_empty())
        .collect()
}

fn now_iso() -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("{millis}")
}

fn next_generation_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    format!("gen_{}_{}", millis, COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(command);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(command);
        cmd
    }
}

fn supervised_command(command: &str) -> Option<Command> {
    if command.contains('>') || command.contains('<') || command.contains('|') || command.contains('&') || command.contains(';') {
        return None;
    }
    let mut parts = command.split_whitespace();
    let program = parts.next()?;
    let mut cmd = Command::new(program);
    cmd.args(parts);
    Some(cmd)
}

fn fingerprint_files(cwd: &Path, config: &CoreConfig) -> BTreeMap<String, u128> {
    let mut files = BTreeMap::new();
    for root in &config.watch.roots {
        let path = cwd.join(root);
        visit_files(cwd, &path, config, &mut files);
    }
    files
}

fn visit_files(cwd: &Path, path: &Path, config: &CoreConfig, out: &mut BTreeMap<String, u128>) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    let relative = normalize_path(path.strip_prefix(cwd).unwrap_or(path));
    if should_ignore(&relative, config) {
        return;
    }
    if metadata.is_dir() {
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            visit_files(cwd, &entry.path(), config, out);
        }
        return;
    }
    if metadata.is_file() {
        let modified = metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|value| value.as_millis()).unwrap_or(0);
        out.insert(relative, modified + u128::from(metadata.len()));
    }
}

fn changed_paths(previous: &BTreeMap<String, u128>, current: &BTreeMap<String, u128>) -> Vec<String> {
    let mut changed = Vec::new();
    for (path, value) in current {
        if previous.get(path) != Some(value) {
            changed.push(path.clone());
        }
    }
    for path in previous.keys() {
        if !current.contains_key(path) {
            changed.push(path.clone());
        }
    }
    changed
}

fn should_ignore(relative: &str, config: &CoreConfig) -> bool {
    config.watch.ignore.iter().any(|pattern| relative.contains(pattern.trim_matches('/')))
}

fn package_bytes(cwd: &Path, config: &CoreConfig) -> Vec<u8> {
    let mut bytes = Vec::new();
    let files = fingerprint_files(cwd, config);
    for path in files.keys() {
        let full_path = cwd.join(path);
        if let Ok(file_bytes) = fs::read(full_path) {
            bytes.extend_from_slice(path.as_bytes());
            bytes.push(0);
            bytes.extend_from_slice(&file_bytes);
            bytes.push(0);
        }
    }
    bytes
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn extract_json_string(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":", key);
    let start = text.find(&needle)? + needle.len();
    let rest = text[start..].trim_start();
    if rest.starts_with("null") {
        return None;
    }
    if !rest.starts_with('"') {
        return None;
    }
    let mut value = String::new();
    let mut escaped = false;
    for ch in rest[1..].chars() {
        if escaped {
            value.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '"' {
            return Some(value);
        }
        value.push(ch);
    }
    None
}

fn extract_json_string_decoded(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":", key);
    let start = text.find(&needle)? + needle.len();
    let rest = text[start..].trim_start();
    if rest.starts_with("null") || !rest.starts_with('"') {
        return None;
    }
    let mut value = String::new();
    let mut chars = rest[1..].chars();
    while let Some(ch) = chars.next() {
        if ch == '"' {
            return Some(value);
        }
        if ch != '\\' {
            value.push(ch);
            continue;
        }
        match chars.next() {
            Some('"') => value.push('"'),
            Some('\\') => value.push('\\'),
            Some('/') => value.push('/'),
            Some('n') => value.push('\n'),
            Some('r') => value.push('\r'),
            Some('t') => value.push('\t'),
            Some('b') => value.push('\u{0008}'),
            Some('f') => value.push('\u{000c}'),
            Some(other) => value.push(other),
            None => return None,
        }
    }
    None
}

fn extract_json_bool(text: &str, key: &str) -> bool {
    let needle = format!("\"{}\":", key);
    let Some(start) = text.find(&needle).map(|value| value + needle.len()) else {
        return false;
    };
    text[start..].trim_start().starts_with("true")
}

fn extract_json_u64(text: &str, key: &str) -> Option<u64> {
    let needle = format!("\"{}\":", key);
    let start = text.find(&needle)? + needle.len();
    let rest = text[start..].trim_start();
    if rest.starts_with("null") {
        return None;
    }
    let digits = rest
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u64>().ok()
}

fn extract_json_string_array(text: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{}\":[", key);
    let Some(start) = text.find(&needle).map(|value| value + needle.len()) else {
        return Vec::new();
    };
    let Some(end) = text[start..].find(']').map(|value| start + value) else {
        return Vec::new();
    };
    text[start..end]
        .split(',')
        .map(|value| value.trim().trim_matches('"').to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn compute_module_build_record_from_json(text: &str) -> Option<ComputeModuleBuildRecord> {
    Some(ComputeModuleBuildRecord {
        id: extract_json_string(text, "id")?,
        host_operation: extract_json_string(text, "hostOperation").unwrap_or_default(),
        source: extract_json_string(text, "source").unwrap_or_default(),
        artifact_path: extract_json_string(text, "artifactPath"),
        artifact_hash: extract_json_string(text, "artifactHash"),
        store_path: extract_json_string(text, "storePath"),
        language: extract_json_string(text, "language").unwrap_or_else(|| "assemblyscript".to_string()),
        abi: extract_json_string(text, "abi").unwrap_or_else(|| "world.hostOperation.v1".to_string()),
        export_name: extract_json_string(text, "export").unwrap_or_else(|| "invoke".to_string()),
        max_memory_pages: extract_json_u64(text, "maxMemoryPages"),
        timeout_ms: extract_json_u64(text, "timeoutMs"),
        allowed_bindings: extract_json_string_array(text, "allowedBindings"),
        context: extract_json_string_decoded(text, "context").or_else(|| extract_json_string(text, "context")),
        success: extract_json_bool(text, "success"),
        error: extract_json_string_decoded(text, "error").or_else(|| extract_json_string(text, "error")),
    })
}

fn soak_session_from_json(text: &str) -> Option<SoakSession> {
    Some(SoakSession {
        id: extract_json_string(text, "id")?,
        scenario: extract_json_string(text, "scenario").unwrap_or_else(|| "soak".to_string()),
        status: extract_json_string(text, "status").unwrap_or_else(|| "running".to_string()),
        started_at: extract_json_string(text, "startedAt").unwrap_or_else(now_iso),
        updated_at: extract_json_string(text, "updatedAt").unwrap_or_else(now_iso),
        completed_at: extract_json_string(text, "completedAt"),
        failure_reason: extract_json_string_decoded(text, "failureReason").or_else(|| extract_json_string(text, "failureReason")),
        sample_count: extract_json_u64(text, "sampleCount").unwrap_or(0),
        healthy_samples: extract_json_u64(text, "healthySamples").unwrap_or(0),
        degraded_samples: extract_json_u64(text, "degradedSamples").unwrap_or(0),
        unhealthy_samples: extract_json_u64(text, "unhealthySamples").unwrap_or(0),
        restart_observed: extract_json_bool(text, "restartObserved"),
        stable_failover_observed: extract_json_bool(text, "stableFailoverObserved"),
        start_restart_count: extract_json_u64(text, "startRestartCount").unwrap_or(0),
        latest_restart_count: extract_json_u64(text, "latestRestartCount").unwrap_or(0),
        current_phase: extract_json_string(text, "currentPhase"),
        latest_sample: None,
        marks: Vec::new(),
        high_water: SoakHighWater::default(),
    })
}

fn soak_mark_from_json(text: &str) -> Option<SoakMark> {
    Some(SoakMark {
        phase: extract_json_string(text, "phase")?,
        message: extract_json_string_decoded(text, "message").or_else(|| extract_json_string(text, "message")),
        marked_at: extract_json_string(text, "markedAt").unwrap_or_else(now_iso),
    })
}

fn soak_sample_from_json(text: &str) -> Option<SoakSample> {
    Some(SoakSample {
        sequence: extract_json_u64(text, "sequence").unwrap_or(0),
        phase: extract_json_string(text, "phase"),
        sampled_at: extract_json_string(text, "sampledAt").unwrap_or_else(now_iso),
        ready: extract_json_bool(text, "ready"),
        status: extract_json_string(text, "status").unwrap_or_else(|| "unknown".to_string()),
        reason_codes: extract_json_string_array(text, "reasonCodes"),
        rss: extract_json_u64(text, "rss").unwrap_or(0),
        heap_used: extract_json_u64(text, "heapUsed").unwrap_or(0),
        event_loop_p95_ms: extract_json_u64(text, "eventLoopP95Ms").unwrap_or(0),
        active_requests: extract_json_u64(text, "activeRequests").unwrap_or(0),
        sse_clients: extract_json_u64(text, "sseClients").unwrap_or(0),
        preview_sessions: extract_json_u64(text, "previewSessions").unwrap_or(0),
        snapshot_watchers: extract_json_u64(text, "snapshotWatchers").unwrap_or(0),
        fswatcher_resources: extract_json_u64(text, "fsWatcherResources").unwrap_or(0),
        timeout_resources: extract_json_u64(text, "timeoutResources").unwrap_or(0),
        process_running: extract_json_bool(text, "processRunning"),
        process_ready: extract_json_bool(text, "processReady"),
        pid: extract_json_u64(text, "pid").map(|value| value as u32),
        restart_count: extract_json_u64(text, "restartCount").unwrap_or(0),
        serving_requested_mode: extract_json_string(text, "servingRequestedMode").unwrap_or_default(),
        serving_effective_mode: extract_json_string(text, "servingEffectiveMode").unwrap_or_default(),
        serving_reason: extract_json_string_decoded(text, "servingReason")
            .or_else(|| extract_json_string(text, "servingReason"))
            .unwrap_or_default(),
        latest_generation_id: extract_json_string(text, "latestGenerationId"),
        latest_generation_state: extract_json_string(text, "latestGenerationState"),
        stable_failover: extract_json_bool(text, "stableFailover"),
    })
}

fn soak_finished_session_from_json(text: &str) -> Option<SoakSession> {
    let id = extract_json_string(text, "id")?;
    let status = extract_json_string(text, "status").unwrap_or_else(|| "completed".to_string());
    let updated_at = extract_json_string(text, "updatedAt").unwrap_or_else(now_iso);
    Some(SoakSession {
        id,
        scenario: "soak".to_string(),
        status: status.clone(),
        started_at: updated_at.clone(),
        updated_at: updated_at.clone(),
        completed_at: Some(updated_at),
        failure_reason: if status == "failed" {
            extract_json_string_decoded(text, "message").or_else(|| extract_json_string(text, "message"))
        } else {
            None
        },
        sample_count: 0,
        healthy_samples: 0,
        degraded_samples: 0,
        unhealthy_samples: 0,
        restart_observed: false,
        stable_failover_observed: false,
        start_restart_count: 0,
        latest_restart_count: 0,
        current_phase: None,
        latest_sample: None,
        marks: Vec::new(),
        high_water: SoakHighWater::default(),
    })
}

fn sha256_hex(bytes: Vec<u8>) -> String {
    let digest = sha256(&bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect::<String>()
}

fn sha256(input: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h = [
        0x6a09e667u32, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let bit_len = (input.len() as u64) * 8;
    let mut data = input.to_vec();
    data.push(0x80);
    while (data.len() + 8) % 64 != 0 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in data.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    let mut out = [0u8; 32];
    for (index, value) in h.iter().enumerate() {
        out[index * 4..index * 4 + 4].copy_from_slice(&value.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::sync::OnceLock;

    struct MemoryStore {
        events: Mutex<Vec<String>>,
    }

    impl MemoryStore {
        fn new() -> Self {
            Self { events: Mutex::new(Vec::new()) }
        }
    }

    impl CoreStore for MemoryStore {
        fn append_event(&self, event: &CoreEvent) -> std::io::Result<()> {
            self.events.lock().unwrap().push(event.to_json());
            Ok(())
        }

        fn read_events(&self) -> std::io::Result<Vec<String>> {
            Ok(self.events.lock().unwrap().clone())
        }
    }

    fn sample_generation(id: &str, state: GenerationState) -> Generation {
        Generation {
            id: id.to_string(),
            state,
            content_hash: "sha256:test".to_string(),
            parent_id: None,
            created_at: "1".to_string(),
            source_paths: vec!["src/a.js".to_string()],
            compute_modules: Vec::new(),
            proofs: Vec::new(),
            correlation: Correlation::empty(),
            promotion_decision: None,
        }
    }

    fn readiness_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn readiness_test_guard() -> std::sync::MutexGuard<'static, ()> {
        readiness_test_lock().lock().unwrap_or_else(|error| error.into_inner())
    }

    fn test_root() -> PathBuf {
        static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(1);
        let root = std::env::temp_dir().join(format!(
            "witness-core-test-{}-{}",
            now_iso(),
            TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn outbound_curl_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn outbound_curl_test_guard() -> std::sync::MutexGuard<'static, ()> {
        outbound_curl_test_lock().lock().unwrap_or_else(|error| error.into_inner())
    }

    fn write_fake_curl_script(root: &Path) -> PathBuf {
        #[cfg(windows)]
        {
            let path = root.join("fake-curl.cmd");
            let script = r#"@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "header="
set "body="
:parse
if "%~1"=="" goto done
if /I "%~1"=="--dump-header" (
  set "header=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--output" (
  set "body=%~2"
  shift
  shift
  goto parse
)
shift
goto parse
:done
> "!header!" (
  echo HTTP/1.1 207 Multi-Status
  echo content-type: application/json
  echo x-test: via-fake-curl
  echo.
)
> "!body!" <nul set /p ={"ok":true}
<nul set /p =207
exit /b 0
"#;
            fs::write(&path, script).unwrap();
            path
        }
        #[cfg(not(windows))]
        {
            let path = root.join("fake-curl.sh");
            let script = r#"#!/bin/sh
header=""
body=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump-header|-D)
      header="$2"
      shift 2
      ;;
    --output|-o)
      body="$2"
      shift 2
      ;;
    --request|--connect-timeout|--max-time|--write-out|--url|--header|--data-binary)
      shift 2
      ;;
    --silent|--show-error|--globoff)
      shift
      ;;
    *)
      shift
      ;;
  esac
done
printf 'HTTP/1.1 207 Multi-Status\r\ncontent-type: application/json\r\nx-test: via-fake-curl\r\n\r\n' > "$header"
printf '{"ok":true}' > "$body"
printf '207'
"#;
            fs::write(&path, script).unwrap();
            #[cfg(unix)]
            {
                let mut permissions = fs::metadata(&path).unwrap().permissions();
                permissions.set_mode(0o755);
                fs::set_permissions(&path, permissions).unwrap();
            }
            path
        }
    }

    fn fixture_config() -> CoreConfig {
        CoreConfig {
            watch: WatchConfig {
                roots: vec!["app".to_string()],
                ignore: vec![".witness-core".to_string()],
            },
            package: PackageConfig {
                include: vec!["app/**".to_string()],
            },
            ..CoreConfig::default()
        }
    }

    #[test]
    fn config_parser_reads_minimum_shape() {
        let config = parse_config(r#"
[watch]
roots = ["src", "plugins"]
ignore = ["target"]

[proof]
fast = "node --test a.test.js"
slow_ms = 123

[package]
include = ["src/**"]

[supervise]
command = "npm run app:engentus"
working_dir = "."
restart_on_exit = false
restart_on_unhealthy = false
health_url = "http://127.0.0.1:3000/api/runtime/process-health"
reload_url = "http://127.0.0.1:3000/api/runtime/app-snapshot/reload"
health_interval_ms = 50
health_timeout_ms = 250
degraded_grace_polls = 7
unhealthy_grace_polls = 2

[build_worker]
command = "node src/witness-core-build-worker.js --manifest {manifest_path} --workspace-root {workspace_root} --runtime-profile {runtime_profile}"
working_dir = "."

[transaction]
build_timeout_ms = 3210
stage_root = ".witness-core/staging"

[compute_modules]
engine = "wasmtime"
execution_mode = "shadow"
artifact_store_root = ".witness-core/artifacts/compute-modules"
"#);
        assert_eq!(config.watch.roots, vec!["src", "plugins"]);
        assert_eq!(config.watch.ignore, vec!["target"]);
        assert_eq!(config.proof.fast, "node --test a.test.js");
        assert_eq!(config.proof.slow_ms, 123);
        assert_eq!(config.package.include, vec!["src/**"]);
        assert_eq!(config.supervise.command.as_deref(), Some("npm run app:engentus"));
        assert_eq!(config.supervise.working_dir.as_deref(), Some("."));
        assert_eq!(config.supervise.restart_on_exit, false);
        assert_eq!(config.supervise.restart_on_unhealthy, false);
        assert_eq!(config.supervise.health_url.as_deref(), Some("http://127.0.0.1:3000/api/runtime/process-health"));
        assert_eq!(config.supervise.reload_url.as_deref(), Some("http://127.0.0.1:3000/api/runtime/app-snapshot/reload"));
        assert_eq!(config.supervise.health_interval_ms, 50);
        assert_eq!(config.supervise.health_timeout_ms, 250);
        assert_eq!(config.supervise.degraded_grace_polls, 7);
        assert_eq!(config.supervise.unhealthy_grace_polls, 2);
        assert_eq!(
            config.build_worker.command.as_deref(),
            Some("node src/witness-core-build-worker.js --manifest {manifest_path} --workspace-root {workspace_root} --runtime-profile {runtime_profile}")
        );
        assert_eq!(config.build_worker.working_dir.as_deref(), Some("."));
        assert_eq!(config.transaction.build_timeout_ms, 3210);
        assert_eq!(config.transaction.stage_root, ".witness-core/staging");
        assert_eq!(config.compute_modules.engine, "wasmtime");
        assert_eq!(config.compute_modules.execution_mode, ComputeModuleExecutionMode::Shadow);
        assert_eq!(config.compute_modules.artifact_store_root, ".witness-core/artifacts/compute-modules");
    }

    #[test]
    fn compute_module_artifacts_copy_into_durable_store() {
        let root = test_root();
        let stage_root = root.join(".witness-core/staging/generation-1");
        let staged_artifact = stage_root.join(".witness-core/compute-modules/test.wasm");
        fs::create_dir_all(staged_artifact.parent().unwrap()).unwrap();
        let wasm_bytes = b"wasm-artifact".to_vec();
        fs::write(&staged_artifact, &wasm_bytes).unwrap();
        let record = ComputeModuleBuildRecord {
            id: "engentus.health.classify".to_string(),
            host_operation: COMPUTE_MODULE_RUNTIME_TARGET_HOST_OPERATION.to_string(),
            source: "app/modules/health-classify/assembly/index.ts".to_string(),
            artifact_path: Some(".witness-core/compute-modules/test.wasm".to_string()),
            artifact_hash: Some(format!("sha256:{}", sha256_hex(wasm_bytes.clone()))),
            store_path: None,
            language: "assemblyscript".to_string(),
            abi: "world.hostOperation.v1".to_string(),
            export_name: "invoke".to_string(),
            max_memory_pages: Some(2),
            timeout_ms: Some(50),
            allowed_bindings: Vec::new(),
            context: None,
            success: true,
            error: None,
        };
        let stored = store_compute_module_artifacts(&root, &stage_root, &CoreConfig::default(), &[record]).unwrap();
        let store_path = root.join(stored[0].store_path.as_deref().unwrap());
        assert!(store_path.exists());
        assert_eq!(fs::read(store_path).unwrap(), wasm_bytes);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capability_path_scope_rejects_absolute_and_parent_paths() {
        let root = test_root();
        let config = fixture_config();
        assert_eq!(resolve_capability_path(&root, &config, "../secrets.txt").unwrap_err().status, 403);
        assert_eq!(resolve_capability_path(&root, &config, "/tmp/secrets.txt").unwrap_err().status, 403);
        assert_eq!(resolve_capability_path(&root, &config, "C:/tmp/secrets.txt").unwrap_err().status, 403);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capability_read_stat_and_patch_are_scoped_to_configured_roots() {
        let root = test_root();
        let app_dir = root.join("app");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("content.wtoml"), "before").unwrap();
        let config = fixture_config();

        let read = capability_fs_read(&root, &config, "content.wtoml").unwrap();
        assert_eq!(read.source_path, "content.wtoml");
        assert_eq!(read.content, "before");
        assert!(read.hash.starts_with("sha256:"));

        let stat = capability_fs_stat(&root, &config, "content.wtoml").unwrap();
        assert_eq!(stat.exists, true);
        assert_eq!(stat.size, Some(6));

        let patched = capability_fs_write(&root, &config, "content.wtoml", "after", false, None).unwrap();
        assert_eq!(patched.size, 5);
        assert_eq!(fs::read_to_string(app_dir.join("content.wtoml")).unwrap(), "after");

        let preview = capability_fs_write(&root, &config, "content.wtoml", "preview only", true, None).unwrap();
        assert_eq!(preview.content, "preview only");
        assert_eq!(fs::read_to_string(app_dir.join("content.wtoml")).unwrap(), "after");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capability_write_rejects_stale_expected_hash() {
        let root = test_root();
        let app_dir = root.join("app");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("content.wtoml"), "before").unwrap();
        let config = fixture_config();

        let error = capability_fs_write(&root, &config, "content.wtoml", "after", false, Some("sha256:stale")).unwrap_err();
        assert_eq!(error.status, 409);
        assert_eq!(error.code.as_deref(), Some("WITNESS_CORE_SOURCE_CONFLICT"));
        assert_eq!(error.exists, Some(true));
        assert_eq!(fs::read_to_string(app_dir.join("content.wtoml")).unwrap(), "before");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sqlite_capability_supports_command_query_and_transaction_rollback() {
        let root = test_root();
        let db_path = root.join("app").join("db").join("main.sqlite");
        let db_path_text = db_path.to_string_lossy().replace('\\', "\\\\");

        let create_body = format!(
            "{{\"operation\":\"command\",\"path\":\"{}\",\"sql\":\"create table items (id integer primary key, title text not null)\"}}",
            db_path_text
        );
        let (create_response, create_operation, _) = handle_sqlite_capability_request(&root, &create_body).unwrap();
        assert_eq!(create_operation, "command");
        let create_json: JsonValue = serde_json::from_str(&create_response).unwrap();
        assert_eq!(create_json.get("ok").and_then(JsonValue::as_bool), Some(true));

        let insert_body = format!(
            "{{\"operation\":\"command\",\"path\":\"{}\",\"sql\":\"insert into items(title) values (?)\",\"params\":[\"first\"]}}",
            db_path_text
        );
        let (insert_response, _, _) = handle_sqlite_capability_request(&root, &insert_body).unwrap();
        let insert_json: JsonValue = serde_json::from_str(&insert_response).unwrap();
        assert_eq!(insert_json.get("changes").and_then(JsonValue::as_u64), Some(1));

        let query_body = format!(
            "{{\"operation\":\"query\",\"path\":\"{}\",\"sql\":\"select title from items order by id\"}}",
            db_path_text
        );
        let (query_response, _, _) = handle_sqlite_capability_request(&root, &query_body).unwrap();
        let query_json: JsonValue = serde_json::from_str(&query_response).unwrap();
        assert_eq!(query_json.get("rowCount").and_then(JsonValue::as_u64), Some(1));
        assert_eq!(query_json.pointer("/rows/0/title").and_then(JsonValue::as_str), Some("first"));

        let transaction_body = format!(
            "{{\"operation\":\"transaction\",\"path\":\"{}\",\"steps\":[{{\"kind\":\"command\",\"sql\":\"insert into items(title) values (?)\",\"params\":[\"rolled-back\"]}},{{\"kind\":\"command\",\"sql\":\"insert into missing_table(title) values (?)\",\"params\":[\"boom\"]}}]}}",
            db_path_text
        );
        let transaction_error = handle_sqlite_capability_request(&root, &transaction_body).unwrap_err();
        assert_eq!(transaction_error.status, 500);

        let (readback_response, _, _) = handle_sqlite_capability_request(&root, &query_body).unwrap();
        let readback_json: JsonValue = serde_json::from_str(&readback_response).unwrap();
        assert_eq!(readback_json.get("rowCount").and_then(JsonValue::as_u64), Some(1));
        assert_eq!(readback_json.pointer("/rows/0/title").and_then(JsonValue::as_str), Some("first"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capability_http_write_emits_journal_event() {
        let root = test_root();
        let app_dir = root.join("app");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("content.wtoml"), "before").unwrap();
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "{\"path\":\"content.wtoml\",\"content\":\"after\",\"reason\":\"test\"}";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "PUT /capabilities/fs/write HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("200 OK"));
        assert_eq!(fs::read_to_string(app_dir.join("content.wtoml")).unwrap(), "after");
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("capability.fs.write"));
        assert!(events.contains("path=content.wtoml"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sqlite_capability_http_emits_journal_event() {
        let root = test_root();
        let app_dir = root.join("app");
        fs::create_dir_all(app_dir.join("db")).unwrap();
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "{\"operation\":\"command\",\"path\":\"app/db/main.sqlite\",\"sql\":\"create table items (id integer primary key, title text not null)\"}";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "POST /capabilities/db/sqlite HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("200 OK"));
        assert!(app_dir.join("db").join("main.sqlite").exists());
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("capability.db.sqlite.command"));
        assert!(events.contains("path=app/db/main.sqlite"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn http_outbound_capability_http_executes_request_and_emits_journal_event() {
        let root = test_root();
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));

        let target_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let target_addr = target_listener.local_addr().unwrap();
        let seen_request = Arc::new(Mutex::new(String::new()));
        let seen_request_clone = Arc::clone(&seen_request);
        let target_handle = thread::spawn(move || {
            let (mut stream, _) = target_listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut request = String::new();
            let mut first_line = String::new();
            reader.read_line(&mut first_line).unwrap();
            request.push_str(&first_line);
            let mut content_length = 0usize;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" || line.is_empty() {
                    request.push_str(&line);
                    break;
                }
                if let Some((name, value)) = line.split_once(':') {
                    if name.trim().eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse::<usize>().unwrap_or(0);
                    }
                }
                request.push_str(&line);
            }
            if content_length > 0 {
                let mut body = vec![0u8; content_length];
                reader.read_exact(&mut body).unwrap();
                request.push_str(&String::from_utf8_lossy(&body));
            }
            *seen_request_clone.lock().unwrap() = request;
            let body = "{\"ok\":true}";
            write!(
                stream,
                "HTTP/1.1 202 Accepted\r\ncontent-type: application/json\r\nx-external-id: ext-1\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = format!(
            "{{\"url\":\"http://127.0.0.1:{}/outbound\",\"method\":\"POST\",\"headers\":{{\"authorization\":\"Bearer test\",\"content-type\":\"application/json\"}},\"bodyText\":\"{{\\\"hello\\\":true}}\",\"timeoutMs\":1500}}",
            target_addr.port()
        );
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "POST /capabilities/network/http-outbound HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        let mut response_text = response.clone();
        response_reader.read_to_string(&mut response_text).unwrap();
        handle.join().unwrap();
        target_handle.join().unwrap();
        assert!(response.contains("200 OK"));
        assert!(response_text.contains("\"status\":202"));
        assert!(response_text.contains("\"transport\":\"network\""));
        let request = seen_request.lock().unwrap().clone();
        assert!(request.contains("POST /outbound HTTP/1.1"));
        assert!(request.to_ascii_lowercase().contains("authorization: bearer test"));
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("capability.network.http.outbound.execute"));
        assert!(events.contains(&format!("url=http://127.0.0.1:{}/outbound", target_addr.port())));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn http_outbound_capability_https_uses_curl_and_emits_journal_event() {
        let _guard = outbound_curl_test_guard();
        let root = test_root();
        let fake_curl = write_fake_curl_script(&root);
        let prior_curl = std::env::var_os("WITNESS_CORE_CURL_BIN");
        std::env::set_var("WITNESS_CORE_CURL_BIN", &fake_curl);
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "{\"url\":\"https://accounts.example.test/token\",\"method\":\"POST\",\"headers\":{\"authorization\":\"Bearer test\",\"content-type\":\"application/json\"},\"bodyText\":\"{\\\"hello\\\":true}\",\"timeoutMs\":1500}";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "POST /capabilities/network/http-outbound HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        let mut response_text = response.clone();
        response_reader.read_to_string(&mut response_text).unwrap();
        handle.join().unwrap();
        match prior_curl {
            Some(value) => std::env::set_var("WITNESS_CORE_CURL_BIN", value),
            None => std::env::remove_var("WITNESS_CORE_CURL_BIN"),
        }
        assert!(response.contains("200 OK"));
        assert!(response_text.contains("\"status\":207"));
        assert!(response_text.contains("\"transport\":\"network\""));
        assert!(response_text.contains("\"x-test\":\"via-fake-curl\""));
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("capability.network.http.outbound.execute"));
        assert!(events.contains("url=https://accounts.example.test/token"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn verification_persistence_http_emits_journal_event_and_persists_rows() {
        let root = test_root();
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "{\"operation\":\"recordPolicyRows\",\"verificationRoot\":\"app/verification\",\"artifactRoot\":\"app/verification/artifacts\",\"cacheRoot\":\"app/verification/cache\",\"rows\":[{\"id\":\"verificationPolicy:test\",\"enabled\":true}]}";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "POST /verification-persistence HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("200 OK"));
        let readback = handle_verification_persistence_request(
            &root,
            "{\"operation\":\"readModelRows\",\"verificationRoot\":\"app/verification\",\"artifactRoot\":\"app/verification/artifacts\",\"cacheRoot\":\"app/verification/cache\"}",
        )
        .unwrap();
        assert!(readback.0.contains("verificationPolicy:test"));
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("verification.persistence.recordPolicyRows"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capability_http_write_conflict_emits_authoring_conflict_event() {
        let root = test_root();
        let app_dir = root.join("app");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("content.wtoml"), "before").unwrap();
        let config = fixture_config();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let server_root = root.clone();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                &server_root,
                &config,
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "{\"path\":\"content.wtoml\",\"content\":\"after\",\"expectedHash\":\"sha256:stale\",\"reason\":\"app.source.write\"}";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "PUT /capabilities/fs/write HTTP/1.1\r\nhost: test\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response_reader = BufReader::new(client);
        let mut response = String::new();
        response_reader.read_line(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("409 Error"));
        assert_eq!(fs::read_to_string(app_dir.join("content.wtoml")).unwrap(), "before");
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("authoring.write.conflict"));
        assert!(events.contains("expectedHash=sha256:stale"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn generation_promotion_updates_aliases() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(store);
        registry.upsert_generation(sample_generation("gen_a", GenerationState::GreenLocal), "generation.green_local", CAP_STORAGE_WRITE);
        assert_eq!(registry.aliases().current_green_local.as_deref(), Some("gen_a"));
        registry.promote("gen_a").unwrap();
        assert_eq!(registry.aliases().current_stable.as_deref(), Some("gen_a"));
        assert_eq!(registry.aliases().last_good.as_deref(), Some("gen_a"));
    }

    #[test]
    fn failed_generation_does_not_replace_stable_alias() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(store);
        registry.upsert_generation(sample_generation("gen_good", GenerationState::Stable), "generation.promoted", CAP_PACKAGE_PROMOTE);
        registry.upsert_generation(sample_generation("gen_bad", GenerationState::ProofFailed), "proof.failed", CAP_PROOF_RUN);
        assert_eq!(registry.aliases().current_stable.as_deref(), Some("gen_good"));
    }

    #[test]
    fn registry_replays_journal_after_restart() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(Arc::clone(&store));
        registry.upsert_generation(sample_generation("gen_green", GenerationState::GreenLocal), "generation.green_local", CAP_STORAGE_WRITE);
        registry.promote("gen_green").unwrap();
        registry.upsert_generation(sample_generation("gen_failed", GenerationState::ProofFailed), "proof.failed", CAP_PROOF_RUN);

        let restored = Registry::new(Arc::clone(&store));
        assert_eq!(restored.generation("gen_green").map(|generation| generation.state), Some(GenerationState::Stable));
        assert_eq!(restored.generation("gen_failed").map(|generation| generation.state), Some(GenerationState::ProofFailed));
        assert_eq!(restored.aliases().current_stable.as_deref(), Some("gen_green"));
        assert_eq!(restored.aliases().last_good.as_deref(), Some("gen_green"));
        assert_eq!(restored.aliases().current_green_local.as_deref(), Some("gen_green"));
    }

    #[test]
    fn registry_replays_preview_sessions_after_restart() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(Arc::clone(&store));
        let session = "{\"id\":\"preview-1\",\"baseAppRevision\":7,\"previewRevision\":1,\"status\":\"active\",\"overlaySources\":[{\"file\":\"C:/tmp/app/content.wtoml\",\"content\":\"text = \\\"Preview\\\"\"}],\"generationHistory\":[]}".to_string();
        registry.upsert_preview_session("preview-1", session.clone());

        let restored = Registry::new(Arc::clone(&store));
        assert_eq!(restored.preview_session("preview-1").as_deref(), Some(session.as_str()));

        let mut deleted = Registry::new(Arc::clone(&store));
        assert_eq!(deleted.delete_preview_session("preview-1"), true);
        let restored_deleted = Registry::new(Arc::clone(&store));
        assert_eq!(restored_deleted.preview_session("preview-1"), None);
    }

    #[test]
    fn serving_mode_defaults_live_and_fails_over_on_failed_latest_generation() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(store);
        assert_eq!(registry.serving_status().requested_mode, ServingMode::Live);
        assert_eq!(registry.serving_status().effective_mode, ServingMode::Live);

        registry.upsert_generation(sample_generation("gen_green", GenerationState::GreenLocal), "generation.green_local", CAP_STORAGE_WRITE);
        assert_eq!(registry.serving_status().effective_mode, ServingMode::Live);

        let mut failed = sample_generation("gen_failed", GenerationState::ProofFailed);
        failed.created_at = "2".to_string();
        registry.upsert_generation(failed, "proof.failed", CAP_PROOF_RUN);
        let status = registry.serving_status();
        assert_eq!(status.requested_mode, ServingMode::Live);
        assert_eq!(status.effective_mode, ServingMode::Stable);
        assert_eq!(status.reason, "latest-failed");
    }

    #[test]
    fn serving_mode_pin_and_replay_persist_requested_mode() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(Arc::clone(&store));
        registry.request_serving_mode(ServingMode::Stable);
        let pinned = registry.serving_status();
        assert_eq!(pinned.requested_mode, ServingMode::Stable);
        assert_eq!(pinned.effective_mode, ServingMode::Stable);
        assert_eq!(pinned.reason, "requested-stable");

        let restored = Registry::new(Arc::clone(&store));
        let restored_status = restored.serving_status();
        assert_eq!(restored_status.requested_mode, ServingMode::Stable);
        assert_eq!(restored_status.effective_mode, ServingMode::Stable);
        assert_eq!(restored_status.reason, "requested-stable");
    }

    #[test]
    fn rollback_sets_requested_serving_mode_to_stable() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let mut registry = Registry::new(store);
        registry.upsert_generation(sample_generation("gen_green", GenerationState::GreenLocal), "generation.green_local", CAP_STORAGE_WRITE);
        registry.promote("gen_green").unwrap();
        registry.request_serving_mode(ServingMode::Live);
        let rolled_back = registry.rollback("gen_green").unwrap();
        assert_eq!(rolled_back.state, GenerationState::Stable);
        let status = registry.serving_status();
        assert_eq!(status.requested_mode, ServingMode::Stable);
        assert_eq!(status.effective_mode, ServingMode::Stable);
        assert_eq!(status.reason, "requested-stable");
    }

    #[test]
    fn sha256_matches_empty_digest() {
        assert_eq!(
            sha256_hex(Vec::new()),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn failed_proof_records_failure_without_panic() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(store)));
        let proof = run_proof(Path::new("."), "fast", "exit 7", 1, "gen_bad".to_string(), registry);
        assert_eq!(proof.status, ProofStatus::Failed);
        assert_eq!(proof.exit_code, Some(7));
    }

    #[test]
    fn http_health_endpoint_returns_ok() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(store)));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                Path::new("."),
                &CoreConfig::default(),
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let mut client = TcpStream::connect(addr).unwrap();
        client.write_all(b"GET /health HTTP/1.1\r\nhost: test\r\n\r\n").unwrap();
        let mut response = String::new();
        match client.read_to_string(&mut response) {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::ConnectionReset => {}
            Err(error) => panic!("unexpected health read error: {error}"),
        }
        handle.join().unwrap();
        assert!(response.contains("200 OK"));
        assert!(response.contains("\"service\":\"witness-core\""));
        assert!(response.contains("\"process\""));
        assert!(response.contains("\"ready\":false"));
        assert!(response.contains("\"healthUrl\":null"));
    }

    #[test]
    fn supervised_process_state_json_includes_readiness_fields() {
        let state = SupervisedProcessState {
            running: true,
            pid: Some(42),
            ready: true,
            last_ready_at: Some("now".to_string()),
            last_health_status: Some("healthy".to_string()),
            status: Some("healthy".to_string()),
            reason_codes: vec!["rss_over_budget".to_string()],
            last_health_sample_at: Some("sampled".to_string()),
            health_url: Some("http://127.0.0.1:3000/api/runtime/process-health".to_string()),
            last_restart_reason: Some("policy unhealthy: sse_clients_over_budget".to_string()),
            ..SupervisedProcessState::default()
        };
        let json = supervised_process_state_to_json(&state);
        assert!(json.contains("\"ready\":true"));
        assert!(json.contains("\"lastReadyAt\":\"now\""));
        assert!(json.contains("\"lastHealthStatus\":\"healthy\""));
        assert!(json.contains("\"status\":\"healthy\""));
        assert!(json.contains("\"reasonCodes\":[\"rss_over_budget\"]"));
        assert!(json.contains("\"lastHealthSampleAt\":\"sampled\""));
        assert!(json.contains("\"healthUrl\":\"http://127.0.0.1:3000/api/runtime/process-health\""));
        assert!(json.contains("\"lastRestartReason\":\"policy unhealthy: sse_clients_over_budget\""));
    }

    #[cfg_attr(windows, ignore = "flaky on windows localhost readiness timing")]
    #[test]
    fn readiness_probe_accepts_successful_http_status() {
        let _guard = readiness_test_guard();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/api/runtime/process-health", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 256];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\ncontent-length: 0\r\n\r\n");
        });
        match wait_for_process_readiness(&url, 25, 15_000) {
            ProcessReadiness::Ready(status) => assert_eq!(status, "204 healthy"),
            ProcessReadiness::Unhealthy(status) => panic!("expected ready, got {status}"),
        }
        handle.join().unwrap();
    }

    #[cfg_attr(windows, ignore = "flaky on windows localhost readiness timing")]
    #[test]
    fn supervised_process_readiness_transition_emits_ready_event() {
        let _guard = readiness_test_guard();
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let health_url = format!("http://{}/api/runtime/process-health", listener.local_addr().unwrap());
        let health_handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 256];
            let _ = stream.read(&mut request);
            let body = "{\"ok\":true,\"ready\":true,\"status\":\"healthy\",\"reasonCodes\":[],\"sampledAt\":\"now\"}";
            let _ = stream.write_all(format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            ).as_bytes());
        });
        #[cfg(windows)]
        let command = "ping -n 8 127.0.0.1 > NUL".to_string();
        #[cfg(not(windows))]
        let command = "sleep 2".to_string();

        start_supervised_process(
            PathBuf::from("."),
            "127.0.0.1:8788".to_string(),
            SuperviseConfig {
                command: Some(command),
                working_dir: None,
                restart_on_exit: false,
                restart_on_unhealthy: true,
                health_url: Some(health_url),
                reload_url: None,
                health_interval_ms: 25,
                health_timeout_ms: 5_000,
                degraded_grace_polls: 10,
                unhealthy_grace_polls: 3,
            },
            Arc::clone(&registry),
            Arc::clone(&process_state),
        );
        let deadline = Instant::now() + Duration::from_millis(20_000);
        let mut saw_ready_event = false;
        while Instant::now() < deadline {
            let events = store.read_events().unwrap().join("\n");
            if events.contains("process.ready") {
                saw_ready_event = true;
                break;
            }
            thread::sleep(Duration::from_millis(25));
        }
        health_handle.join().unwrap();
        let events = store.read_events().unwrap().join("\n");
        assert!(saw_ready_event);
        assert!(events.contains("process.ready"));
    }

    #[test]
    fn http_generation_publish_accepts_form_encoded_payload() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(store)));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let watch_state = Arc::new(Mutex::new(WatcherState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(
                stream,
                Path::new("."),
                &CoreConfig::default(),
                server_registry,
                server_process_state,
                watch_state,
                Arc::new(ComputeModuleRuntime::new().unwrap()),
            )
            .unwrap();
        });
        let body = "id=preview-1&state=green_local&contentHash=sha256%3Atest&sourcePaths=%5B%22app%2Fshell.rvm%22%5D&sessionId=user-session&surfaceId=route.goodman&actor=alice";
        let mut client = TcpStream::connect(addr).unwrap();
        write!(
            client,
            "POST /generations HTTP/1.1\r\nhost: test\r\ncontent-type: application/x-www-form-urlencoded\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("\"id\":\"preview-1\""));
        assert!(response.contains("\"state\":\"green_local\""));
        let registry = registry.lock().unwrap();
        let generation = registry.generation("preview-1").unwrap();
        assert_eq!(generation.source_paths, vec!["app/shell.rvm"]);
        assert_eq!(generation.correlation.session_id.as_deref(), Some("user-session"));
        assert_eq!(registry.aliases().current_green_local.as_deref(), Some("preview-1"));
    }

    #[test]
    fn supervised_process_updates_state_and_emits_lifecycle_events() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState {
            command: Some("exit 0".to_string()),
            restart_on_exit: false,
            ..SupervisedProcessState::default()
        }));
        start_supervised_process(
            PathBuf::from("."),
            "127.0.0.1:8788".to_string(),
            SuperviseConfig {
                command: Some("exit 0".to_string()),
                working_dir: None,
                restart_on_exit: false,
                restart_on_unhealthy: true,
                health_url: None,
                reload_url: None,
                health_interval_ms: 500,
                health_timeout_ms: 10_000,
                degraded_grace_polls: 10,
                unhealthy_grace_polls: 3,
            },
            Arc::clone(&registry),
            Arc::clone(&process_state),
        );
        thread::sleep(Duration::from_millis(400));
        let state = process_state.lock().unwrap().clone();
        assert_eq!(state.running, false);
        assert_eq!(state.last_exit_code, Some(0));
        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("process.started"));
        assert!(events.contains("process.exited"));
    }

    #[test]
    fn process_restart_and_stop_requests_update_state_and_emit_events() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(Arc::clone(&store))));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState {
            command: Some("npm run app:engentus".to_string()),
            restart_on_exit: true,
            running: false,
            ..SupervisedProcessState::default()
        }));

        let restarted = request_process_restart(Arc::clone(&registry), Arc::clone(&process_state)).unwrap();
        assert_eq!(restarted.restart_requested, true);
        assert_eq!(restarted.restart_on_exit, true);

        let stopped = request_process_stop(Arc::clone(&registry), Arc::clone(&process_state)).unwrap();
        assert_eq!(stopped.stop_requested, true);
        assert_eq!(stopped.restart_on_exit, false);

        let events = store.read_events().unwrap().join("\n");
        assert!(events.contains("process.restart.requested"));
        assert!(events.contains("process.stop.requested"));
    }
}
