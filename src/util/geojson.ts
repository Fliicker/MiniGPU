import * as turf from "@turf/turf";
import { Feature, GeoJsonProperties, FeatureCollection, Polygon, MultiPolygon, Position } from "geojson";

function getVertices(geojson: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>) {
    let vertices: number[] = [];
    turf.featureEach(geojson, (polygon) => {
        const array = polygonToArray(polygon);
        vertices.push(...array);
    });

    return new Float32Array(vertices);
}

function getLines(geojson: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>) {
    let lineArray: Float32Array[] = [];
    turf.featureEach(geojson, (polygon) => {
        const lines = turf.polygonToLine(polygon);
        turf.flattenEach(lines, (line) => {
            const coords = line.geometry.coordinates as Position[];
            const lineData = new Float32Array(coords.flatMap(coord => [...coord]));
            lineArray.push(lineData);
        });
    });
    return lineArray;
}

function polygonToArray(polygon: Feature<Polygon | MultiPolygon>) {
    let array: number[] = [];
    let triangles = turf.tesselate(polygon);
    turf.flattenEach(triangles, (triangle) => {
        let triangleData = triangle.geometry.coordinates[0]
            .slice(0, 3)
            .flat();
        array.push(...triangleData);
    });

    return array;
}

export { getVertices, getLines }
