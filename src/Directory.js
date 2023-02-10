import React, { useState } from 'react';
function bytesToMegabytes(bytes) {
  return bytes / Math.pow(10, 6);
}
const Subdirectory = ({ name, status, totalBytes }) => {
  console.log({ name, status })
  return (

    <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, marginLeft: 10 }}>
      <div style={{ width: '100%', marginRight: 20 }}>{name}</div>
      <div style={{ width: '100%', display: 'flex'}}>
        <div>Total: {bytesToMegabytes(totalBytes).toPrecision(3)} MB</div>
        <div style={{ width: `${status}%`, height: 20, backgroundColor: 'lightgreen' }} />
      </div>
    </div>
  );
};

const Directory = ({ subdirectories, name }) => {
  console.log({ subdirectories })

  return (
    <div style={{ padding: '10px', background: 'white', width: '100%', height: '100%' }}>
      <span> {name} </span>
      {subdirectories.map((sub) => (
        <Subdirectory
          key={sub.name}
          name={sub.name}
          status={(sub.uploadedBytes / sub.totalBytes) * 100}
          totalBytes={sub.totalBytes}
        />
      ))}
    </div>
  );
};

export default Directory;