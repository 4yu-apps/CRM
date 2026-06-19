"""Sinks da esteira (storage)."""
from .base import LeadSink
from .jsonfile import JsonFileSink
from .supabase import SupabaseSink

__all__ = ["LeadSink", "JsonFileSink", "SupabaseSink"]
