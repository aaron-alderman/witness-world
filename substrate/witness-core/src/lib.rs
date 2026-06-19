use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CAP_STORAGE_READ: &str = "storage.read";
const CAP_STORAGE_WRITE: &str = "storage.write";
const CAP_NOTIFY_SURFACE: &str = "notify.surface";
const CAP_PROOF_RUN: &str = "proof.run";
const CAP_PACKAGE_PROMOTE: &str = "package.promote";

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
pub struct Generation {
    pub id: String,
    pub state: GenerationState,
    pub content_hash: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub source_paths: Vec<String>,
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
    pub restart_on_exit: bool,
}

#[derive(Clone, Debug)]
pub struct CoreConfig {
    pub watch: WatchConfig,
    pub proof: ProofConfig,
    pub package: PackageConfig,
    pub supervise: SuperviseConfig,
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
                restart_on_exit: true,
            },
        }
    }
}

#[derive(Clone, Debug)]
pub struct SupervisedProcessState {
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub restart_on_exit: bool,
    pub running: bool,
    pub pid: Option<u32>,
    pub restart_count: u64,
    pub last_started_at: Option<String>,
    pub last_exited_at: Option<String>,
    pub last_exit_code: Option<i32>,
    pub last_error: Option<String>,
    pub restart_requested: bool,
    pub stop_requested: bool,
}

impl Default for SupervisedProcessState {
    fn default() -> Self {
        Self {
            command: None,
            working_dir: None,
            restart_on_exit: false,
            running: false,
            pid: None,
            restart_count: 0,
            last_started_at: None,
            last_exited_at: None,
            last_exit_code: None,
            last_error: None,
            restart_requested: false,
            stop_requested: false,
        }
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
            emitted_at: now_iso(),
        }
    }

    fn with_generation(mut self, generation: &Generation) -> Self {
        self.generation_id = Some(generation.id.clone());
        self.generation = Some(generation.clone());
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
        format!("{{{}}}", fields.into_iter().filter(|v| !v.is_empty()).collect::<Vec<_>>().join(","))
    }
}

pub struct Registry {
    generations: BTreeMap<String, Generation>,
    aliases: Aliases,
    store: Arc<dyn CoreStore>,
    subscribers: Vec<mpsc::Sender<CoreEvent>>,
}

impl Registry {
    pub fn new(store: Arc<dyn CoreStore>) -> Self {
        let mut registry = Self {
            generations: BTreeMap::new(),
            aliases: Aliases::default(),
            store,
            subscribers: Vec::new(),
        };
        registry.replay_journal();
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

    pub fn subscribe(&mut self) -> mpsc::Receiver<CoreEvent> {
        let (sender, receiver) = mpsc::channel();
        self.subscribers.push(sender);
        receiver
    }

    pub fn upsert_generation(&mut self, generation: Generation, kind: &str, capability: &str) {
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
        Ok(generation)
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
}

pub fn run_host(config_path: PathBuf, addr: String) -> std::io::Result<()> {
    let cwd = std::env::current_dir()?;
    let config = load_config(&config_path).unwrap_or_default();
    let store: Arc<dyn CoreStore> = Arc::new(FileStore::new(cwd.join(".witness-core")));
    let registry = Arc::new(Mutex::new(Registry::new(store)));
    let process_state = Arc::new(Mutex::new(SupervisedProcessState {
        command: config.supervise.command.clone(),
        working_dir: config.supervise.working_dir.clone(),
        restart_on_exit: config.supervise.restart_on_exit,
        ..SupervisedProcessState::default()
    }));
    {
        let mut registry_guard = registry.lock().expect("registry lock");
        registry_guard.emit(CoreEvent::new("core.started", CAP_NOTIFY_SURFACE));
    }
    start_watcher(cwd.clone(), config.clone(), Arc::clone(&registry));
    start_supervised_process(
        cwd.clone(),
        addr.clone(),
        config.supervise.clone(),
        Arc::clone(&registry),
        Arc::clone(&process_state),
    );
    serve_http(addr, registry, process_state)
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
            ("supervise", "restart_on_exit") => {
                config.supervise.restart_on_exit = matches!(value.trim(), "true" | "1" | "\"true\"");
            }
            _ => {}
        }
    }
    config
}

fn start_watcher(cwd: PathBuf, config: CoreConfig, registry: Arc<Mutex<Registry>>) {
    thread::spawn(move || {
        let mut previous = fingerprint_files(&cwd, &config);
        loop {
            thread::sleep(Duration::from_millis(1000));
            let current = fingerprint_files(&cwd, &config);
            let changed = changed_paths(&previous, &current);
            if !changed.is_empty() {
                run_generation_pipeline(&cwd, &config, &changed, Arc::clone(&registry));
            }
            previous = current;
        }
    });
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
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr)?;
    for stream in listener.incoming() {
        let Ok(stream) = stream else {
            continue;
        };
        let registry = Arc::clone(&registry);
        let process_state = Arc::clone(&process_state);
        thread::spawn(move || {
            let _ = handle_client(stream, registry, process_state);
        });
    }
    Ok(())
}

fn handle_client(
    mut stream: TcpStream,
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut first_line = String::new();
    reader.read_line(&mut first_line)?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
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
            write_json(
                &mut stream,
                200,
                &format!(
                    "{{\"ok\":true,\"service\":\"witness-core\",\"process\":{}}}",
                    supervised_process_state_to_json(&state)
                ),
            )
        }
        ("GET", "/generations") => {
            let registry = registry.lock().expect("registry lock");
            write_json(&mut stream, 200, &registry_to_json(&registry))
        }
        ("GET", "/processes") => {
            let state = process_state.lock().expect("process state lock").clone();
            write_json(
                &mut stream,
                200,
                &format!("{{\"process\":{}}}", supervised_process_state_to_json(&state)),
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
            }

            let mut child = match shell_command(&command)
                .current_dir(&working_dir)
                .env("WITNESS_CORE_URL", format!("http://{}", addr))
                .spawn()
            {
                Ok(child) => child,
                Err(error) => {
                    let message = format!("failed to spawn supervised process: {}", error);
                    {
                        let mut state = process_state.lock().expect("process state lock");
                        state.last_error = Some(message.clone());
                        state.last_exited_at = Some(now_iso());
                        state.running = false;
                        state.pid = None;
                    }
                    registry.lock().expect("registry lock").emit(CoreEvent {
                        kind: "process.failed".to_string(),
                        capability: CAP_NOTIFY_SURFACE.to_string(),
                        generation_id: None,
                        message: Some(message),
                        generation: None,
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
                state.running = true;
                state.pid = Some(child.id());
                state.last_started_at = Some(now_iso());
                state.last_error = None;
            }
            registry.lock().expect("registry lock").emit(CoreEvent {
                kind: "process.started".to_string(),
                capability: CAP_NOTIFY_SURFACE.to_string(),
                generation_id: None,
                message: Some(format!("command={}", command)),
                generation: None,
                emitted_at: now_iso(),
            });

            let exit_status = child.wait();
            let (exit_code, error_message) = match exit_status {
                Ok(status) => (status.code(), None),
                Err(error) => (None, Some(format!("process wait failed: {}", error))),
            };
            {
                let mut state = process_state.lock().expect("process state lock");
                state.running = false;
                state.pid = None;
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
                    emitted_at: now_iso(),
                });
                thread::sleep(Duration::from_millis(500));
            }
        }
    });
}

fn request_process_restart(
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> Result<SupervisedProcessState, String> {
    let pid = {
        let mut state = process_state.lock().expect("process state lock");
        if state.command.as_deref().unwrap_or("").trim().is_empty() {
            return Err("supervised process is not configured".to_string());
        }
        state.restart_on_exit = true;
        state.restart_requested = true;
        state.stop_requested = false;
        state.pid
    };
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "process.restart.requested".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some("manual restart requested".to_string()),
        generation: None,
        emitted_at: now_iso(),
    });
    if let Some(pid) = pid {
        terminate_process(pid)?;
    }
    Ok(process_state.lock().expect("process state lock").clone())
}

fn request_process_stop(
    registry: Arc<Mutex<Registry>>,
    process_state: Arc<Mutex<SupervisedProcessState>>,
) -> Result<SupervisedProcessState, String> {
    let pid = {
        let mut state = process_state.lock().expect("process state lock");
        if state.command.as_deref().unwrap_or("").trim().is_empty() {
            return Err("supervised process is not configured".to_string());
        }
        state.restart_on_exit = false;
        state.restart_requested = false;
        state.stop_requested = true;
        state.pid
    };
    registry.lock().expect("registry lock").emit(CoreEvent {
        kind: "process.stop.requested".to_string(),
        capability: CAP_NOTIFY_SURFACE.to_string(),
        generation_id: None,
        message: Some("manual stop requested".to_string()),
        generation: None,
        emitted_at: now_iso(),
    });
    if let Some(pid) = pid {
        terminate_process(pid)?;
    }
    Ok(process_state.lock().expect("process state lock").clone())
}

fn terminate_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|error| format!("failed to invoke taskkill: {}", error))?;
        if !status.success() {
            return Err(format!("taskkill exited with {:?}", status.code()));
        }
    }
    #[cfg(not(windows))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|error| format!("failed to invoke kill: {}", error))?;
        if !status.success() {
            return Err(format!("kill exited with {:?}", status.code()));
        }
    }
    Ok(())
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

fn registry_to_json(registry: &Registry) -> String {
    let generations = registry.generations().iter().map(generation_to_json).collect::<Vec<_>>().join(",");
    format!(
        "{{\"aliases\":{},\"generations\":[{}]}}",
        aliases_to_json(&registry.aliases()),
        generations
    )
}

fn generation_to_json(generation: &Generation) -> String {
    let source_paths = generation.source_paths.iter().map(|v| json_string(v)).collect::<Vec<_>>().join(",");
    let proofs = generation.proofs.iter().map(proof_to_json).collect::<Vec<_>>().join(",");
    format!(
        "{{{},{},{},{},{},\"sourcePaths\":[{}],\"proofs\":[{}],\"correlation\":{},{} }}",
        json_pair("id", &generation.id),
        json_pair("state", generation.state.as_str()),
        json_pair("contentHash", &generation.content_hash),
        json_optional_pair("parentId", generation.parent_id.as_deref()),
        json_pair("createdAt", &generation.created_at),
        source_paths,
        proofs,
        correlation_to_json(&generation.correlation),
        json_optional_pair("promotionDecision", generation.promotion_decision.as_deref())
    )
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

fn supervised_process_state_to_json(state: &SupervisedProcessState) -> String {
    format!(
        "{{{},{},{},{},{},{},{},{},{},{},{}}}",
        json_optional_pair("command", state.command.as_deref()),
        json_optional_pair("workingDir", state.working_dir.as_deref()),
        json_bool_pair("restartOnExit", state.restart_on_exit),
        json_bool_pair("running", state.running),
        json_number_optional_pair("pid", state.pid.map(|value| value as u64)),
        json_number_optional_pair("restartCount", Some(state.restart_count)),
        json_optional_pair("lastStartedAt", state.last_started_at.as_deref()),
        json_optional_pair("lastExitedAt", state.last_exited_at.as_deref()),
        json_number_optional_pair("lastExitCode", state.last_exit_code.map(|value| value as u64)),
        json_optional_pair("lastError", state.last_error.as_deref()),
        json_bool_pair("restartRequested", state.restart_requested)
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

fn json_number_optional_pair(key: &str, value: Option<u64>) -> String {
    match value {
        Some(value) => format!("\"{}\":{}", key, value),
        None => format!("\"{}\":null", key),
    }
}

fn json_bool_pair(key: &str, value: bool) -> String {
    format!("\"{}\":{}", key, if value { "true" } else { "false" })
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
            proofs: Vec::new(),
            correlation: Correlation::empty(),
            promotion_decision: None,
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
command = "npm run engentus"
working_dir = "."
restart_on_exit = false
"#);
        assert_eq!(config.watch.roots, vec!["src", "plugins"]);
        assert_eq!(config.watch.ignore, vec!["target"]);
        assert_eq!(config.proof.fast, "node --test a.test.js");
        assert_eq!(config.proof.slow_ms, 123);
        assert_eq!(config.package.include, vec!["src/**"]);
        assert_eq!(config.supervise.command.as_deref(), Some("npm run engentus"));
        assert_eq!(config.supervise.working_dir.as_deref(), Some("."));
        assert_eq!(config.supervise.restart_on_exit, false);
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
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(stream, server_registry, server_process_state).unwrap();
        });
        let mut client = TcpStream::connect(addr).unwrap();
        client.write_all(b"GET /health HTTP/1.1\r\nhost: test\r\n\r\n").unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        handle.join().unwrap();
        assert!(response.contains("200 OK"));
        assert!(response.contains("\"service\":\"witness-core\""));
        assert!(response.contains("\"process\""));
    }

    #[test]
    fn http_generation_publish_accepts_form_encoded_payload() {
        let store: Arc<dyn CoreStore> = Arc::new(MemoryStore::new());
        let registry = Arc::new(Mutex::new(Registry::new(store)));
        let process_state = Arc::new(Mutex::new(SupervisedProcessState::default()));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server_registry = Arc::clone(&registry);
        let server_process_state = Arc::clone(&process_state);
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(stream, server_registry, server_process_state).unwrap();
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
            command: Some("npm run engentus".to_string()),
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
