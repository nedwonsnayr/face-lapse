"""Storage service abstraction for local filesystem and cloud storage (R2/S3)."""

import logging
from pathlib import Path
from typing import BinaryIO, Optional

from ..config import (
    USE_CLOUD_STORAGE,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_ENDPOINT,
    R2_PUBLIC_URL,
    ORIGINALS_DIR,
    ALIGNED_DIR,
    VIDEOS_DIR,
)

log = logging.getLogger("face-lapse.storage")

# Lazy import boto3 only if cloud storage is enabled
_boto3_client = None


def _get_s3_client():
    """Get or create boto3 S3 client for R2."""
    global _boto3_client
    if _boto3_client is None:
        import boto3
        _boto3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        )
    return _boto3_client


def _get_local_path(key: str, directory: Path) -> Path:
    """Get local filesystem path for a storage key."""
    return directory / key


def _get_cloud_key(key: str, prefix: str = "") -> str:
    """Get cloud storage key with optional prefix."""
    if prefix:
        return f"{prefix}/{key}"
    return key


def upload_file(
    file_path: Path | str,
    key: str,
    user_id: Optional[int] = None,
    directory: str = "originals",
) -> str:
    """
    Upload a file to storage (local or cloud).
    
    Args:
        file_path: Local path to the file to upload
        key: Storage key (filename) for the file
        user_id: Optional user ID for cloud storage organization
        directory: Directory type ("originals", "aligned", "videos")
    
    Returns:
        Storage path/key that can be used to retrieve the file
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if USE_CLOUD_STORAGE:
        # Upload to cloud storage
        s3_client = _get_s3_client()
        prefix = f"users/{user_id}/{directory}" if user_id else directory
        cloud_key = _get_cloud_key(key, prefix)
        
        try:
            s3_client.upload_file(str(file_path), R2_BUCKET, cloud_key)
            log.info(f"Uploaded {file_path.name} to cloud storage: {cloud_key}")
            return cloud_key
        except Exception as e:
            log.error(f"Failed to upload {file_path.name} to cloud: {e}")
            raise
    else:
        # Use local filesystem
        if directory == "originals":
            target_dir = ORIGINALS_DIR
        elif directory == "aligned":
            target_dir = ALIGNED_DIR
        elif directory == "videos":
            target_dir = VIDEOS_DIR
        else:
            raise ValueError(f"Unknown directory: {directory}")
        
        target_path = _get_local_path(key, target_dir)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # If source and destination are the same, no need to copy
        if Path(file_path).resolve() == target_path.resolve():
            log.info(f"File already in target location: {target_path}")
            return str(target_path)
        
        # Copy file to target location
        import shutil
        shutil.copy2(file_path, target_path)
        log.info(f"Copied {file_path.name} to local storage: {target_path}")
        return str(target_path)


def download_file(
    storage_key: str,
    local_path: Path | str,
    user_id: Optional[int] = 1,  # Default to user 1 for local dev
) -> Path:
    """
    Download a file from storage to local filesystem.
    
    Args:
        storage_key: Storage key or local path
        local_path: Where to save the downloaded file
        user_id: Optional user ID for cloud storage
    
    Returns:
        Path to the downloaded file
    """
    local_path = Path(local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    
    if USE_CLOUD_STORAGE:
        # Download from cloud storage
        s3_client = _get_s3_client()
        try:
            s3_client.download_file(R2_BUCKET, storage_key, str(local_path))
            log.info(f"Downloaded {storage_key} from cloud to {local_path}")
            return local_path
        except Exception as e:
            log.error(f"Failed to download {storage_key} from cloud: {e}")
            raise
    else:
        # Use local filesystem - just return the path if it exists
        source_path = Path(storage_key)
        if source_path.exists():
            import shutil
            shutil.copy2(source_path, local_path)
            return local_path
        else:
            raise FileNotFoundError(f"File not found: {source_path}")


def delete_file(storage_key: str, user_id: Optional[int] = 1) -> None:
    """
    Delete a file from storage.
    
    Args:
        storage_key: Storage key or local path
        user_id: Optional user ID for cloud storage
    """
    if USE_CLOUD_STORAGE:
        # Delete from cloud storage
        s3_client = _get_s3_client()
        try:
            s3_client.delete_object(Bucket=R2_BUCKET, Key=storage_key)
            log.info(f"Deleted {storage_key} from cloud storage")
        except Exception as e:
            log.error(f"Failed to delete {storage_key} from cloud: {e}")
            raise
    else:
        # Delete from local filesystem
        file_path = Path(storage_key)
        if file_path.exists():
            file_path.unlink()
            log.info(f"Deleted {file_path} from local storage")


def get_url(storage_key: str, user_id: Optional[int] = 1) -> str:
    """
    Get a URL to access a file.
    
    Args:
        storage_key: Storage key or local path
        user_id: Optional user ID for cloud storage
    
    Returns:
        URL to access the file (public URL for cloud, file:// for local)
    """
    if USE_CLOUD_STORAGE:
        # Return public URL for cloud storage
        if R2_PUBLIC_URL:
            return f"{R2_PUBLIC_URL.rstrip('/')}/{storage_key}"
        else:
            # Generate presigned URL (expires in 1 hour)
            s3_client = _get_s3_client()
            try:
                url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": R2_BUCKET, "Key": storage_key},
                    ExpiresIn=3600,
                )
                return url
            except Exception as e:
                log.error(f"Failed to generate presigned URL for {storage_key}: {e}")
                raise
    else:
        # Return file:// URL for local filesystem
        file_path = Path(storage_key)
        return f"file://{file_path.absolute()}"


def file_exists(storage_key: str, user_id: Optional[int] = 1) -> bool:
    """
    Check if a file exists in storage.
    
    Args:
        storage_key: Storage key or local path
        user_id: Optional user ID for cloud storage
    
    Returns:
        True if file exists, False otherwise
    """
    if USE_CLOUD_STORAGE:
        # Check cloud storage
        s3_client = _get_s3_client()
        try:
            s3_client.head_object(Bucket=R2_BUCKET, Key=storage_key)
            return True
        except s3_client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise
    else:
        # Check local filesystem
        return Path(storage_key).exists()


def get_local_path_for_processing(storage_key: str, user_id: Optional[int] = 1) -> Path:
    """
    Get a local file path for processing (downloads from cloud if needed).
    
    This is useful when you need to process a file (e.g., alignment, video generation)
    but it might be stored in cloud storage.
    
    Args:
        storage_key: Storage key or local path
        user_id: Optional user ID for cloud storage
    
    Returns:
        Local Path object that can be used for file operations
    """
    if USE_CLOUD_STORAGE:
        # Check if it's already a local path (absolute path starting with /)
        # This handles migration from local to cloud storage
        if Path(storage_key).is_absolute() and Path(storage_key).exists():
            return Path(storage_key)
        
        # Download to temp location for processing
        import tempfile
        temp_dir = Path(tempfile.gettempdir()) / "face-lapse-processing"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = temp_dir / Path(storage_key).name
        download_file(storage_key, temp_path, user_id)
        return temp_path
    else:
        # Already local, just return the path (handles both absolute and relative paths)
        path = Path(storage_key)
        if path.is_absolute():
            return path
        # If relative, try to resolve it
        return path.resolve() if path.exists() else path
