import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productImage} from '../lib/product-image';
test('normalizes supplier image encodings',()=>{
 assert.equal(productImage('["https://example.com/lamp.jpg"]'),'https://example.com/lamp.jpg');
 assert.equal(productImage(['', 'https://example.com/tool.jpg']),'https://example.com/tool.jpg');
 assert.equal(productImage('//example.com/image.jpg'),'https://example.com/image.jpg');
 assert.equal(productImage('javascript:alert(1)'),'');
 assert.equal(productImage('[invalid]'),'');
 assert.equal(productImage(null),'');
});
