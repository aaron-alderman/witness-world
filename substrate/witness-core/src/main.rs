use std::env;
use std::path::PathBuf;

fn main() {
    let mut config_path = PathBuf::from("witness-core.toml");
    let mut addr = "127.0.0.1:8788".to_string();
    let args: Vec<String> = env::args().collect();
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--config" if index + 1 < args.len() => {
                config_path = PathBuf::from(&args[index + 1]);
                index += 2;
            }
            "--addr" if index + 1 < args.len() => {
                addr = args[index + 1].clone();
                index += 2;
            }
            _ => {
                index += 1;
            }
        }
    }

    if let Err(error) = witness_core::run_host(config_path, addr) {
        eprintln!("witness-core failed: {error}");
        std::process::exit(1);
    }
}
