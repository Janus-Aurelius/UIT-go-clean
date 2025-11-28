import { Injectable } from '@nestjs/common';
import { latLngToCell, cellToLatLng, gridDisk } from 'h3-js';

@Injectable()
export class H3Service {
  static readonly SHARD_RESOLUTION = 5; // City-level (~2-7 km)
  static readonly BUCKET_RESOLUTION = 9; // Block-level (~50-174m)
  static readonly NUM_SHARDS = 4;

  /**
   * Convert lat/lng to H3 index at specified resolution
   */
  latLngToCell(lat: number, lng: number, resolution: number): string {
    return latLngToCell(lat, lng, resolution);
  }

  /**
   * Calculate shard ID (0-3) using consistent hashing
   * Uses H3 Resolution 5 (city-level) for consistent geographic partitioning
   */
  getShardId(lat: number, lng: number): number {
    const hex = this.latLngToCell(lat, lng, H3Service.SHARD_RESOLUTION);

    // Simple hash: sum of character codes modulo 4
    let hash = 0;
    for (let i = 0; i < hex.length; i++) {
      hash += hex.charCodeAt(i);
    }

    return hash % H3Service.NUM_SHARDS;
  }

  /**
   * Generate smart bucket key
   * Format: "shard:{0-3}:hex:{h3_index_res9}"
   */
  getSmartBucketKey(lat: number, lng: number): string {
    const hex = this.latLngToCell(lat, lng, H3Service.BUCKET_RESOLUTION);
    const shardId = this.getShardId(lat, lng);
    return `shard:${shardId}:hex:${hex}`;
  }

  /**
   * Get K-ring neighbors (includes center)
   * K=0: 1 hex, K=1: 7 hexes, K=2: 19 hexes, K=5: 91 hexes
   */
  gridDisk(h3Index: string, k: number): string[] {
    return gridDisk(h3Index, k);
  }

  /**
   * Get lat/lng center of H3 cell
   */
  cellToLatLng(h3Index: string): { lat: number; lng: number } {
    const [lat, lng] = cellToLatLng(h3Index);
    return { lat, lng };
  }
}
